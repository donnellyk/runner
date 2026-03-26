import type { Job, Queue } from 'bullmq';
import type { Logger } from 'pino';
import { rm, readFile, mkdir } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { extname, join, basename } from 'node:path';
import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import * as yauzl from 'yauzl-promise';
import { eq, sql } from 'drizzle-orm';
import type { Database } from '@web-runner/db/client';
import {
  activities,
  activityLaps,
  activityStreams,
  activitySegments,
} from '@web-runner/db/schema';
import { mapStravaSportType } from '@web-runner/strava';
import { WorkoutType, type BulkImportJobData } from '@web-runner/shared';
import { parseFitFile } from '../fit-parser.js';
import { parseGpxFile } from '../gpx-parser.js';
import { parseTcxFile } from '../tcx-parser.js';
import { computeSegments, buildRouteWkt } from '../segments.js';
import type { ParsedActivity } from '../parsed-activity.js';

const MAX_FILE_COUNT = 50_000;
const MAX_TOTAL_SIZE_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB
const MAX_DECOMPRESSED_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

interface CsvRow {
  activityId: string;
  activityDate: string;
  activityName: string;
  activityType: string;
  activityDescription: string;
  elapsedTime: number;
  movingTime: number;
  distance: number; // meters (from detailed Distance column)
  averageSpeed: number;
  maxSpeed: number;
  elevationGain: number;
  averageHeartrate: number;
  maxHeartrate: number;
  averageCadence: number;
  averageWatts: number;
  filename: string;
}

/**
 * Parse a CSV line, handling quoted fields (double-quote escaping).
 * Returns an array of field values.
 */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i <= line.length) {
    if (i === line.length) {
      fields.push('');
      break;
    }
    if (line[i] === '"') {
      // Quoted field
      let value = '';
      i++; // skip opening quote
      while (i < line.length) {
        if (line[i] === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            value += '"';
            i += 2;
          } else {
            i++; // skip closing quote
            break;
          }
        } else {
          value += line[i];
          i++;
        }
      }
      fields.push(value);
      if (i < line.length && line[i] === ',') i++; // skip comma
    } else {
      // Unquoted field
      const nextComma = line.indexOf(',', i);
      if (nextComma === -1) {
        fields.push(line.slice(i));
        break;
      } else {
        fields.push(line.slice(i, nextComma));
        i = nextComma + 1;
      }
    }
  }
  return fields;
}

/**
 * Parse the Strava bulk export activities.csv.
 * The CSV has headers; we find columns by name so column order doesn't matter.
 */
export function splitCsvLines(content: string): string[] {
  const lines: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && content[i + 1] === '\n') i++;
      if (current.trim().length > 0) lines.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim().length > 0) lines.push(current);
  return lines;
}

function parseCsv(content: string): CsvRow[] {
  const lines = splitCsvLines(content);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const col = (name: string): number => headers.indexOf(name);
  // For columns that appear twice (Elapsed Time, Distance), use lastIndexOf for the detailed version
  const colLast = (name: string): number => headers.lastIndexOf(name);

  const iId = col('Activity ID');
  const iDate = col('Activity Date');
  const iName = col('Activity Name');
  const iType = col('Activity Type');
  const iDesc = col('Activity Description');
  const iElapsed = colLast('Elapsed Time');
  const iMoving = col('Moving Time');
  const iDistance = colLast('Distance');
  const iAvgSpeed = col('Average Speed');
  const iMaxSpeed = col('Max Speed');
  const iElevGain = col('Elevation Gain');
  const iAvgHr = col('Average Heart Rate');
  const iMaxHr = colLast('Max Heart Rate');
  const iAvgCad = col('Average Cadence');
  const iAvgWatts = col('Average Watts');
  const iFilename = col('Filename');

  if (iId === -1 || iDate === -1 || iName === -1 || iType === -1) {
    throw new Error(
      `activities.csv missing required columns. Found: ${headers.join(', ')}`,
    );
  }

  const num = (fields: string[], idx: number): number => idx !== -1 ? Number(fields[idx]) || 0 : 0;

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    rows.push({
      activityId: fields[iId]?.trim() ?? '',
      activityDate: fields[iDate]?.trim() ?? '',
      activityName: fields[iName]?.trim() ?? 'Untitled',
      activityType: fields[iType]?.trim() ?? '',
      activityDescription: iDesc !== -1 ? (fields[iDesc]?.trim() ?? '') : '',
      elapsedTime: num(fields, iElapsed),
      movingTime: num(fields, iMoving),
      distance: num(fields, iDistance),
      averageSpeed: num(fields, iAvgSpeed),
      maxSpeed: num(fields, iMaxSpeed),
      elevationGain: num(fields, iElevGain),
      averageHeartrate: num(fields, iAvgHr),
      maxHeartrate: num(fields, iMaxHr),
      averageCadence: num(fields, iAvgCad),
      averageWatts: num(fields, iAvgWatts),
      filename: iFilename !== -1 ? (fields[iFilename]?.trim() ?? '') : '',
    });
  }

  return rows;
}

function parseActivityDate(dateStr: string): Date {
  // Strava CSV date format: "Oct 4, 2024, 7:05:00 AM" or ISO-ish
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  // Fallback: return epoch if unparseable
  return new Date(0);
}

function getFileExtension(filename: string): string {
  // Handle .fit.gz, .gpx.gz, .tcx.gz
  const lower = filename.toLowerCase();
  if (lower.endsWith('.fit.gz')) return '.fit';
  if (lower.endsWith('.gpx.gz')) return '.gpx';
  if (lower.endsWith('.tcx.gz')) return '.tcx';
  return extname(lower);
}

const gunzipAsync = promisify(gunzip);

const ALLOWED_EXTENSIONS = new Set(['.fit', '.fit.gz', '.gpx', '.gpx.gz', '.tcx', '.tcx.gz']);

function isAllowedFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ALLOWED_EXTENSIONS.has(extname(lower)) ||
    lower.endsWith('.fit.gz') || lower.endsWith('.gpx.gz') || lower.endsWith('.tcx.gz');
}

async function parseActivityFile(
  buffer: Buffer,
  filename: string,
): Promise<ParsedActivity | null> {
  const ext = getFileExtension(filename);

  // Decompress .gz if needed (async to avoid blocking the event loop)
  let data = buffer;
  if (filename.toLowerCase().endsWith('.gz')) {
    const decompressed = await gunzipAsync(buffer);
    if (decompressed.length > MAX_DECOMPRESSED_FILE_SIZE) {
      throw new Error(
        `Decompressed file too large: ${decompressed.length} bytes exceeds limit of ${MAX_DECOMPRESSED_FILE_SIZE}`,
      );
    }
    data = decompressed;
  }

  switch (ext) {
    case '.fit':
      return parseFitFile(data);
    case '.gpx':
      return parseGpxFile(data.toString('utf-8'));
    case '.tcx':
      return parseTcxFile(data.toString('utf-8'));
    default:
      return null;
  }
}

export async function handleBulkImport(
  job: Job<BulkImportJobData>,
  deps: { db: Database; queue: Queue; logger: Logger },
) {
  const { db, queue, logger } = deps;
  const { userId, filePath } = job.data;

  // Extract the ZIP streaming — one entry at a time, never loading the whole archive.
  // First pass: read activities.csv and build a set of needed filenames.
  // Second pass: extract only the needed activity files to a temp directory.
  const extractDir = join(tmpdir(), 'web-runner-imports', `extract-${randomUUID()}`);
  await mkdir(extractDir, { recursive: true });

  try {
  let csvContent: string | null = null;
  const extractedFiles = new Map<string, string>(); // lowercase filename -> disk path
  let entryCount = 0;
  let totalSize = 0;

  // First pass: find and read activities.csv
  const zip1 = await yauzl.open(filePath);
  try {
    for await (const entry of zip1) {
      entryCount++;
      if (entryCount > MAX_FILE_COUNT) {
        throw new Error(`ZIP contains more than ${MAX_FILE_COUNT} entries`);
      }
      if (entry.filename.includes('..') || entry.filename.startsWith('/')) {
        throw new Error(`ZIP contains unsafe path: ${entry.filename}`);
      }
      if (entry.filename === 'activities.csv' || entry.filename.endsWith('/activities.csv')) {
        const stream = await entry.openReadStream();
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(chunk as Buffer);
        }
        csvContent = Buffer.concat(chunks).toString('utf-8');
      }
    }
  } finally {
    await zip1.close();
  }

  if (!csvContent) {
    throw new Error('ZIP does not contain activities.csv');
  }

  const csvRows = parseCsv(csvContent);
  csvContent = null; // free memory

  if (csvRows.length === 0) {
    logger.info({ userId }, 'Bulk import: activities.csv is empty');
    return;
  }

  // Build a set of filenames we need from the CSV (only allowed file types)
  const neededFiles = new Set<string>();
  for (const row of csvRows) {
    if (row.filename && isAllowedFile(row.filename)) {
      neededFiles.add(row.filename.toLowerCase());
    }
  }

  // Second pass: extract only needed activity files to disk, one at a time
  const zip2 = await yauzl.open(filePath);
  try {
    for await (const entry of zip2) {
      if (entry.filename.endsWith('/')) continue; // skip directories
      totalSize += entry.uncompressedSize;
      if (totalSize > MAX_TOTAL_SIZE_BYTES) {
        throw new Error(`ZIP total uncompressed size exceeds limit of ${MAX_TOTAL_SIZE_BYTES} bytes`);
      }

      const nameLower = entry.filename.toLowerCase();
      // Check both the full path and the path without root prefix
      const stripped = nameLower.includes('/') ? nameLower.slice(nameLower.indexOf('/') + 1) : nameLower;

      if (neededFiles.has(nameLower) || neededFiles.has(stripped)) {
        if (entry.uncompressedSize > MAX_DECOMPRESSED_FILE_SIZE) {
          logger.warn({ filename: entry.filename, size: entry.uncompressedSize }, 'Skipping oversized file');
          continue;
        }
        const destPath = join(extractDir, basename(entry.filename));
        const readStream = await entry.openReadStream();
        await pipeline(readStream, createWriteStream(destPath));
        // Map both the full path and stripped path to the extracted file
        extractedFiles.set(nameLower, destPath);
        extractedFiles.set(stripped, destPath);
      }
    }
  } finally {
    await zip2.close();
  }

  // Cancel any queued per-activity jobs for these activity IDs
  const activityIds = new Set(csvRows.map((r) => String(r.activityId)));
  const [waiting, delayed] = await Promise.all([
    queue.getJobs(['waiting']),
    queue.getJobs(['delayed']),
  ]);
  for (const j of [...waiting, ...delayed]) {
    if (!j.data) continue;
    const type = j.data.type;
    if (
      (type === 'activity-import' || type === 'activity-streams') &&
      j.data.userId === userId &&
      activityIds.has(String(j.data.activityId))
    ) {
      await j.remove();
    }
  }

  // Sort newest first by date
  csvRows.sort(
    (a, b) => parseActivityDate(b.activityDate).getTime() - parseActivityDate(a.activityDate).getTime(),
  );

  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < csvRows.length; i++) {
    // Check if the job has been cancelled via the API (sets cancelled flag on job data)
    const freshJob = await queue.getJob(job.id!);
    if (freshJob?.data?.cancelled) {
      logger.info({ userId, processed: i, total: csvRows.length }, 'Bulk import: cancelled by user');
      break;
    }

    const row = csvRows[i];

    if (!row.activityId) {
      skipped++;
      continue;
    }

    try {
      let parsed: ParsedActivity | null = null;

      // Try to find and parse the activity file from extracted files on disk
      if (row.filename) {
        const diskPath = extractedFiles.get(row.filename.toLowerCase());
        if (diskPath) {
          const fileBuffer = await readFile(diskPath);
          parsed = await parseActivityFile(fileBuffer, row.filename);
        } else {
          logger.warn(
            { activityId: row.activityId, filename: row.filename },
            'Activity file not found in ZIP',
          );
        }
      }

      const startDate = parsed?.summary.startDate ?? parseActivityDate(row.activityDate);

      // Use CSV values as the primary source for summary fields.
      // The CSV always has complete data; FIT session summaries can be empty/zero.
      const or0 = (a: number | null | undefined, b: number): number => (a != null && a > 0) ? a : b;
      const orNull = (a: number | null | undefined, b: number): number | null => {
        if (a != null && a > 0) return a;
        return b > 0 ? b : null;
      };

      // row.distance is already in meters (from the detailed Distance column)
      const distanceMeters = or0(parsed?.summary.distance, row.distance);
      const elapsedTime = Math.round(or0(parsed?.summary.elapsedTime, row.elapsedTime));
      const movingTime = Math.round(or0(parsed?.summary.movingTime, row.movingTime || elapsedTime));
      const averageSpeed = orNull(parsed?.summary.averageSpeed, row.averageSpeed);

      const latlng = parsed?.streams.latlng ?? null;
      const startLatlng = latlng && latlng.length > 0 ? latlng[0] : null;
      const endLatlng = latlng && latlng.length > 0 ? latlng[latlng.length - 1] : null;
      const hasHeartrate =
        (parsed?.summary.averageHeartrate ?? 0) > 0 ||
        row.averageHeartrate > 0 ||
        (parsed?.streams.heartrate?.length ?? 0) > 0;
      const hasPower =
        (parsed?.summary.averageWatts ?? 0) > 0 ||
        row.averageWatts > 0 ||
        (parsed?.streams.watts?.length ?? 0) > 0;

      const values = {
        externalId: String(row.activityId),
        source: 'strava' as const,
        userId,
        name: row.activityName || 'Untitled',
        sportType: mapStravaSportType(row.activityType),
        workoutType: WorkoutType.DEFAULT,
        distance: distanceMeters,
        movingTime,
        elapsedTime,
        totalElevationGain: orNull(parsed?.summary.totalElevationGain, row.elevationGain),
        startDate,
        startLatlng: startLatlng ? [startLatlng[0], startLatlng[1]] : null,
        endLatlng: endLatlng ? [endLatlng[0], endLatlng[1]] : null,
        averageSpeed,
        maxSpeed: orNull(parsed?.summary.maxSpeed, row.maxSpeed),
        averageHeartrate: orNull(parsed?.summary.averageHeartrate, row.averageHeartrate),
        maxHeartrate: orNull(parsed?.summary.maxHeartrate, row.maxHeartrate),
        averageCadence: orNull(parsed?.summary.averageCadence, row.averageCadence),
        averageWatts: orNull(parsed?.summary.averageWatts, row.averageWatts),
        hasHeartrate,
        hasPower,
        deviceName: parsed?.summary.deviceName ?? null,
        gearId: null,
      };

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { externalId, source, userId: _uid, ...updateFields } = values;

      const filteredUpdate: Record<string, unknown> = {
        ...updateFields,
        updatedAt: new Date(),
        syncStatus: 'complete',
      };

      const routeWkt = latlng ? buildRouteWkt(latlng) : null;
      if (routeWkt) filteredUpdate.route = sql`ST_GeomFromEWKT(${routeWkt})`;

      const actDbId = await db.transaction(async (tx) => {
        const [actRow] = await tx
          .insert(activities)
          .values({
            ...values,
            route: routeWkt ? sql`ST_GeomFromEWKT(${routeWkt})` : null,
            syncStatus: 'complete',
          })
          .onConflictDoUpdate({
            target: [activities.source, activities.externalId],
            set: filteredUpdate,
            where: eq(activities.userId, userId),
          })
          .returning({ id: activities.id });

        // If the conflict row belongs to a different user, Postgres skips the
        // update and returns no row — skip laps/streams/segments for this activity.
        if (!actRow) return null;

        const id = actRow.id;

        // Upsert laps
        if (parsed && parsed.laps.length > 0) {
          for (const lap of parsed.laps) {
            await tx
              .insert(activityLaps)
              .values({
                activityId: id,
                lapIndex: lap.lapIndex,
                elapsedTime: lap.elapsedTime != null ? Math.round(lap.elapsedTime) : null,
                movingTime: lap.movingTime != null ? Math.round(lap.movingTime) : null,
                distance: lap.distance,
                startDate: lap.startDate,
                totalElevationGain: lap.totalElevationGain,
                averageSpeed: lap.averageSpeed,
                maxSpeed: lap.maxSpeed,
                averageHeartrate: lap.averageHeartrate,
                maxHeartrate: lap.maxHeartrate,
                averageCadence: lap.averageCadence,
                averageWatts: lap.averageWatts,
              })
              .onConflictDoUpdate({
                target: [activityLaps.activityId, activityLaps.lapIndex],
                set: {
                  elapsedTime: lap.elapsedTime != null ? Math.round(lap.elapsedTime) : null,
                  movingTime: lap.movingTime != null ? Math.round(lap.movingTime) : null,
                  distance: lap.distance,
                  startDate: lap.startDate,
                  totalElevationGain: lap.totalElevationGain,
                  averageSpeed: lap.averageSpeed,
                  maxSpeed: lap.maxSpeed,
                  averageHeartrate: lap.averageHeartrate,
                  maxHeartrate: lap.maxHeartrate,
                  averageCadence: lap.averageCadence,
                  averageWatts: lap.averageWatts,
                },
              });
          }
        }

        // Upsert streams
        if (parsed) {
          const streamEntries = Object.entries(parsed.streams).filter(
            ([, data]) => data != null && (data as unknown[]).length > 0,
          );
          for (const [streamType, data] of streamEntries) {
            const arr = data as unknown[];
            await tx
              .insert(activityStreams)
              .values({
                activityId: id,
                streamType,
                data: arr,
                originalSize: arr.length,
                resolution: 'high',
              })
              .onConflictDoUpdate({
                target: [activityStreams.activityId, activityStreams.streamType],
                set: {
                  data: arr,
                  originalSize: arr.length,
                  resolution: 'high',
                },
              });
          }

          // Compute and upsert segments
          const segments = computeSegments({
            distance: parsed.streams.distance ?? undefined,
            time: parsed.streams.time ?? undefined,
            latlng: parsed.streams.latlng ?? undefined,
            heartrate: parsed.streams.heartrate ?? undefined,
            cadence: parsed.streams.cadence ?? undefined,
            watts: parsed.streams.watts ?? undefined,
            altitude: parsed.streams.altitude ?? undefined,
            velocity_smooth: parsed.streams.velocity_smooth ?? undefined,
          });

          for (const seg of segments) {
            await tx
              .insert(activitySegments)
              .values({
                activityId: id,
                segmentIndex: seg.segmentIndex,
                route: seg.routeWkt ? sql`ST_GeomFromEWKT(${seg.routeWkt})` : null,
                distanceStart: seg.distanceStart,
                distanceEnd: seg.distanceEnd,
                duration: seg.duration,
                avgPace: seg.avgPace,
                minPace: seg.minPace,
                maxPace: seg.maxPace,
                avgHeartrate: seg.avgHeartrate,
                minHeartrate: seg.minHeartrate,
                maxHeartrate: seg.maxHeartrate,
                avgCadence: seg.avgCadence,
                minCadence: seg.minCadence,
                maxCadence: seg.maxCadence,
                avgPower: seg.avgPower,
                minPower: seg.minPower,
                maxPower: seg.maxPower,
                elevationGain: seg.elevationGain,
                elevationLoss: seg.elevationLoss,
              })
              .onConflictDoUpdate({
                target: [activitySegments.activityId, activitySegments.segmentIndex],
                set: {
                  route: seg.routeWkt ? sql`ST_GeomFromEWKT(${seg.routeWkt})` : null,
                  distanceStart: seg.distanceStart,
                  distanceEnd: seg.distanceEnd,
                  duration: seg.duration,
                  avgPace: seg.avgPace,
                  minPace: seg.minPace,
                  maxPace: seg.maxPace,
                  avgHeartrate: seg.avgHeartrate,
                  minHeartrate: seg.minHeartrate,
                  maxHeartrate: seg.maxHeartrate,
                  avgCadence: seg.avgCadence,
                  minCadence: seg.minCadence,
                  maxCadence: seg.maxCadence,
                  avgPower: seg.avgPower,
                  minPower: seg.minPower,
                  maxPower: seg.maxPower,
                  elevationGain: seg.elevationGain,
                  elevationLoss: seg.elevationLoss,
                },
              });
          }
        }

        return id;
      });

      if (actDbId === null) {
        skipped++;
        logger.warn(
          { activityId: row.activityId },
          'Bulk import: activity belongs to another user, skipping',
        );
      } else {
        imported++;
        logger.debug(
          { activityId: row.activityId, actDbId, hasFile: !!parsed },
          'Bulk import: activity processed',
        );
      }
    } catch (err) {
      failed++;
      logger.error(
        { activityId: row.activityId, err },
        'Bulk import: failed to process activity',
      );
    }

    await job.updateProgress({ current: i + 1, total: csvRows.length, imported, skipped, failed });

    // Yield the event loop between activities to avoid starving other work
    if (i % 10 === 9) await new Promise((r) => setTimeout(r, 50));
  }

  logger.info(
    { userId, total: csvRows.length, imported, skipped, failed },
    'Bulk import complete',
  );

  } finally {
    // Cleanup the uploaded ZIP and extracted files on all code paths
    try {
      await rm(filePath, { force: true });
      await rm(extractDir, { recursive: true, force: true });
    } catch {
      logger.warn({ filePath, extractDir }, 'Bulk import: failed to cleanup files');
    }
  }
}

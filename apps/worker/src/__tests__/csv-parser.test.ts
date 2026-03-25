import { describe, it, expect } from 'vitest';
import { splitCsvLines, parseCsvLine } from '../jobs/bulk-import.js';

describe('splitCsvLines', () => {
	it('splits simple lines', () => {
		expect(splitCsvLines('a,b,c\n1,2,3')).toEqual(['a,b,c', '1,2,3']);
	});

	it('handles CRLF line endings', () => {
		expect(splitCsvLines('a,b\r\n1,2\r\n3,4')).toEqual(['a,b', '1,2', '3,4']);
	});

	it('skips empty lines', () => {
		expect(splitCsvLines('a,b\n\n1,2\n\n')).toEqual(['a,b', '1,2']);
	});

	it('preserves newlines inside quoted fields', () => {
		const csv = 'id,desc,val\n1,"line one\nline two",100\n2,"simple",200';
		const lines = splitCsvLines(csv);
		expect(lines).toEqual([
			'id,desc,val',
			'1,"line one\nline two",100',
			'2,"simple",200',
		]);
	});

	it('preserves CRLF inside quoted fields', () => {
		const csv = 'id,desc\r\n1,"has\r\nnewline"\r\n2,"ok"';
		const lines = splitCsvLines(csv);
		expect(lines).toEqual([
			'id,desc',
			'1,"has\r\nnewline"',
			'2,"ok"',
		]);
	});

	it('handles multiple newlines inside a single quoted field', () => {
		const csv = 'a,b\n1,"first\nsecond\nthird"\n2,simple';
		const lines = splitCsvLines(csv);
		expect(lines).toEqual([
			'a,b',
			'1,"first\nsecond\nthird"',
			'2,simple',
		]);
	});

	it('handles quoted field at end of line', () => {
		const csv = 'a,b\n1,"multi\nline"';
		const lines = splitCsvLines(csv);
		expect(lines).toEqual(['a,b', '1,"multi\nline"']);
	});

	it('handles escaped quotes inside quoted fields with newlines', () => {
		const csv = 'a,b\n1,"she said ""hello""\nthen left"';
		const lines = splitCsvLines(csv);
		expect(lines).toEqual(['a,b', '1,"she said ""hello""\nthen left"']);
	});

	it('returns empty array for empty input', () => {
		expect(splitCsvLines('')).toEqual([]);
	});

	it('returns single line for no newlines', () => {
		expect(splitCsvLines('a,b,c')).toEqual(['a,b,c']);
	});
});

describe('parseCsvLine', () => {
	it('splits simple comma-separated values', () => {
		expect(parseCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
	});

	it('handles quoted fields', () => {
		expect(parseCsvLine('"hello","world"')).toEqual(['hello', 'world', '']);
	});

	it('handles escaped quotes inside quoted fields', () => {
		expect(parseCsvLine('"she said ""hi"""')).toEqual(['she said "hi"', '']);
	});

	it('handles mixed quoted and unquoted fields', () => {
		expect(parseCsvLine('1,"Morning Run",10.5')).toEqual(['1', 'Morning Run', '10.5']);
	});

	it('handles commas inside quoted fields', () => {
		expect(parseCsvLine('1,"Run, then rest",done')).toEqual(['1', 'Run, then rest', 'done']);
	});

	it('handles newlines inside quoted fields (after splitCsvLines preserves them)', () => {
		expect(parseCsvLine('1,"line one\nline two",100')).toEqual(['1', 'line one\nline two', '100']);
	});

	it('handles empty fields', () => {
		expect(parseCsvLine('a,,c')).toEqual(['a', '', 'c']);
	});

	it('handles empty quoted fields', () => {
		expect(parseCsvLine('"",b,""')).toEqual(['', 'b', '', '']);
	});
});

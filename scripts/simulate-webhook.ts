const event = process.env.EVENT ?? 'activity:create';
const activityId = process.env.ACTIVITY_ID ?? '12345';
const ownerId = process.env.OWNER_ID ?? '67890';
const baseUrl = process.env.BASE_URL ?? 'http://localhost:5173';

const [objectType, aspectType] = event.split(':');

const payload = {
  object_type: objectType,
  aspect_type: aspectType,
  object_id: Number(activityId),
  owner_id: Number(ownerId),
  subscription_id: 0,
  event_time: Math.floor(Date.now() / 1000),
  updates: {},
};

console.log('Sending webhook payload:', JSON.stringify(payload, null, 2));

const res = await fetch(`${baseUrl}/api/webhooks/strava`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

console.log(`Response: ${res.status} ${res.statusText}`);
const body = await res.json();
console.log(JSON.stringify(body, null, 2));

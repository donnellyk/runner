const action = process.argv[2];
const clientId = process.env.STRAVA_CLIENT_ID;
const clientSecret = process.env.STRAVA_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error('STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET must be set');
  process.exit(1);
}

async function subscribe() {
  const callbackUrl = process.argv[3];
  const verifyToken = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN;
  if (!callbackUrl) {
    console.error('Usage: webhook-manage.ts subscribe <callback_url>');
    process.exit(1);
  }
  if (!verifyToken) {
    console.error('STRAVA_WEBHOOK_VERIFY_TOKEN env var required');
    process.exit(1);
  }

  const res = await fetch('https://www.strava.com/api/v3/push_subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      callback_url: callbackUrl,
      verify_token: verifyToken,
    }),
  });

  const body = await res.json();
  console.log(`Status: ${res.status}`);
  console.log(JSON.stringify(body, null, 2));
}

async function list() {
  const res = await fetch(
    `https://www.strava.com/api/v3/push_subscriptions?client_id=${clientId}&client_secret=${clientSecret}`,
  );
  const body = await res.json();
  console.log(JSON.stringify(body, null, 2));
}

async function remove() {
  const subId = process.env.SUBSCRIPTION_ID;
  if (!subId) {
    console.error('SUBSCRIPTION_ID env var required');
    process.exit(1);
  }

  const res = await fetch(`https://www.strava.com/api/v3/push_subscriptions/${subId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
    }),
  });

  console.log(`Status: ${res.status}`);
  if (res.status === 204) {
    console.log('Subscription deleted');
  } else {
    const body = await res.json();
    console.log(JSON.stringify(body, null, 2));
  }
}

switch (action) {
  case 'subscribe':
    await subscribe();
    break;
  case 'list':
    await list();
    break;
  case 'delete':
    await remove();
    break;
  default:
    console.error('Usage: webhook-manage.ts <subscribe|list|delete>');
    process.exit(1);
}

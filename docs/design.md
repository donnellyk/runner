# Untitled Web Running Project

I want to build something for the web that utilizes my years of Strava data as well as other features. I don't know the exact design / feature set yet.
One of the goals of this project is to stand up a complete web stack and learn from that proces, since its something I haven't done.

## Feature Ideas
### Musts
- Connection w/ Strava / webhooks for new data
- Importing historic data from Strava via API

### Ideas

- Historical inference / statistics / reports from Strava running data, that go beyond what Strava provides.
  - I'd like the ability to overlay & compare race / workout efforts -- HR, pace, GAP,etc
  - A really silly idea is "Bloomberg Terminal for Running", lots of charts & ways of working through those charts.

- Training plans / calendar
  - I'd like to be able to import training plans in a standard format (YML?) and then be able to 'start' a training plan.
  - I should be able to put in a target race day and then the tool tells me when to start.
  - The 'week' view is the most important to me: A list of workouts I need to do that week
    - Generally this might be linked to a specific day of the week, but should be flexible. Drag & drop to reorder.
    - Smart enough to link new Strava activities w/ a planned workout, so it gets 'checked off'
      - Should infer from distance / effort & then score the workout based against the plan. 

- Rich API support so I can eventually create an app for this as week.

## Technical Stack
Again, the goal here is to learn so ee might over-engineer some areas (ie. for scalability that will never happen). But we should strike a balance, we also want a useable tool.

### Language / Framework choice
- The frontend should be Svelt
- For the backend, I'm leaning towards typescript / Sveltkit for consistent though I do like Go and could be recommended something else.

### Authentication
Even though this will likely have 1 users for the for-seeable future, we should build in the idea of a user profile / auth from the beginning. JWTokens, etc.

### DB
Postgres seems like a sensible choice, but we'll be using a lot of geodata. I know Postgres has extensions to handle things like that as well.

### Infra
Given the traffic will be minimal (1 user), we could get away with a simple Docker / Docker Compose setup but, because I want this to be a learning / experiment oppurtunity, I think we should go beyond that. I don't think we need to go full K8s and maybe Compose is good enough, but I'd like to keep a more robust infrastructure in mind. I know projects like k0s or k3s or nomad exist and might be a good fit here.

Generally, to start, I don't think this will be exposed to the wider internet and largely run via a Tailscale network / VPN.

### Preproduction / Local
I think we'll need a rich interface to mock the Strava connection, so that any preproduction / local version is useable w/o real data coming in.

### Deploy
Most likely, this will be run on a local NAS server or the smallest Digital Ocean droplet. Deploys should be easy, from a make file or mise. I don't really like git-ops, but would consider it if standard.

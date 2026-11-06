# Task API

I built this API to bring together what we practiced in WD 2200. Users can register, log in, and manage their own tasks. It uses PostgreSQL to save data, Redis for caching, and roles for admin access.

## Run it

Use Node.js 22 or 24 and Docker Desktop.

```sh
cd "start/Task Management API"
npm ci
npm run setup
cd ../..
docker compose up -d --build
cd "start/Task Management API"
npm run db:seed
```

The API runs at `http://localhost:3005`. Admin login details are in the private `.env` file.

## Test it

Run `npm test` from the app folder. In Bruno, open `bruno/Task API`, select **Local**, and run the requests in order.

/// <reference types="@cloudflare/workers-types" />
// Aplikasi inti: Express yang sama dengan dev server, data di tiga D1. Non-/api dilayani assets.
import { env } from 'cloudflare:workers';
import { httpServerHandler } from 'cloudflare:node';
import { createApp } from '../src/server/app';

const app = createApp({ core: env.DB_CORE, hr: env.DB_HR, public: env.DB_PUBLIC });
app.listen(3000);

export default httpServerHandler({ port: 3000 });

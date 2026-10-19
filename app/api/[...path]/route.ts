import {env} from 'cloudflare:workers';
import {handleAPI} from '../../../server/api.mjs';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handleAPI(request,(env as any).BUCKET);}
export async function POST(request:Request){return handleAPI(request,(env as any).BUCKET);}

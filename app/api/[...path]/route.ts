import {env} from 'cloudflare:workers';
import {handleAPI} from '../../../server/api.mjs';
export const dynamic='force-dynamic';
const options=()=>({adminToken:(env as any).ADMIN_TOKEN});
export async function GET(request:Request){return handleAPI(request,(env as any).BUCKET,options());}
export async function POST(request:Request){return handleAPI(request,(env as any).BUCKET,options());}

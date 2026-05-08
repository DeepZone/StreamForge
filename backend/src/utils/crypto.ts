import crypto from 'crypto'; export const hashIp=(ip:string)=>crypto.createHash('sha256').update(ip).digest('hex');

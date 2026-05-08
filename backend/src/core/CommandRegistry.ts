export class CommandRegistry { private m=new Map<string,any>(); set(k:string,v:any){this.m.set(k,v);} get(k:string){return this.m.get(k);} }

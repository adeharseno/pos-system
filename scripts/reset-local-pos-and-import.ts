import { resolve } from "node:path";
import { Client } from "pg";
import * as XLSX from "xlsx";

const OPERATIONAL_TABLES = [
  "return_item_batches", "return_items", "returns",
  "transaction_item_batches", "transaction_prescriptions", "transaction_items", "transactions",
  "stock_opname_items", "stock_opname_sessions",
  "purchase_invoice_receipts", "purchase_invoice_payments", "purchase_invoice_requests",
  "manual_stock_receiving_events", "manual_stock_receiving_requests", "product_batches",
  "purchase_invoice_items", "purchase_invoices", "initial_product_import_requests",
  "product_units", "products", "operational_expenses", "invoice_sequences",
] as const;

type Source = Record<string, unknown>;
type Row = {
  rowNumber:number; name:string; sku:string; unit:string; price:number; stock:number|null;
  category:string; subcategory:string; supplier:string;
};

const clean=(value:unknown)=>String(value??"").trim();
const key=(value:string)=>value.replace(/\s+/g," ").toLocaleLowerCase("id-ID");
function number(value:unknown,label:string,row:number,{nullable=false,integer=false}:{nullable?:boolean;integer?:boolean}={}) {
  const raw=clean(value); if(!raw&&nullable)return null;
  const normalized=raw.replace(/\s/g,"").replace(/,/g,"");
  const parsed=Number(normalized);
  if(!Number.isFinite(parsed)||parsed<0||(integer&&!Number.isSafeInteger(parsed)))throw new Error(`Baris ${row}: ${label} tidak valid.`);
  return parsed;
}
function score(source:Source) {
  return Number(Boolean(clean(source.SKU)))*8+Number(Boolean(clean(source["Satuan Dasar"])))*4+Number((number(source.Harga,"Harga",0)??0)>0)*2+Number(clean(source.Stok)!=="");
}
function readRows(file:string) {
  const workbook=XLSX.readFile(file,{cellText:true,cellDates:false});
  const sheet=workbook.Sheets.Produk; if(!sheet)throw new Error('Sheet "Produk" tidak ditemukan.');
  const sources=XLSX.utils.sheet_to_json<Source>(sheet,{raw:false,defval:"",blankrows:false});
  const required=["Nama","Harga","SKU","Satuan Dasar","Sub kategori","Klasifikasi","Stok","Supplier"];
  const headers=new Set(Object.keys(sources[0]??{})); for(const value of required)if(!headers.has(value))throw new Error(`Kolom ${value} tidak ditemukan.`);
  const chosen=new Map<string,{source:Source;rowNumber:number}>(); let skippedDuplicate=0;
  sources.forEach((source,index)=>{const rowNumber=index+2,name=clean(source.Nama);if(!name)throw new Error(`Baris ${rowNumber}: Nama wajib diisi.`);const normalized=key(name);const current=chosen.get(normalized);if(!current)chosen.set(normalized,{source,rowNumber});else{skippedDuplicate++;if(score(source)>score(current.source))chosen.set(normalized,{source,rowNumber});}});
  const reserved=new Set<string>(); for(const {source} of chosen.values()){const sku=clean(source.SKU);if(sku){const normalized=key(sku);if(reserved.has(normalized))throw new Error(`SKU duplikat: ${sku}`);reserved.add(normalized);}}
  let generated=0;
  const rows:Row[]=[...chosen.values()].sort((a,b)=>a.rowNumber-b.rowNumber).map(({source,rowNumber})=>{
    let sku=clean(source.SKU);if(!sku){const base=`INT-${String(rowNumber).padStart(5,"0")}`;sku=base;for(let suffix=2;reserved.has(key(sku));suffix++)sku=`${base}-${suffix}`;reserved.add(key(sku));generated++;}
    return {rowNumber,name:clean(source.Nama),sku,unit:clean(source["Satuan Dasar"]),price:number(source.Harga,"Harga",rowNumber) as number,stock:number(source.Stok,"Stok",rowNumber,{nullable:true,integer:true}),category:clean(source.Klasifikasi),subcategory:clean(source["Sub kategori"]),supplier:clean(source.Supplier)};
  });
  return {rows,sourceCount:sources.length,skippedDuplicate,generated};
}
async function tableCounts(client:Client) {
  const result:Record<string,number>={};
  for(const table of OPERATIONAL_TABLES){const value=await client.query<{count:string}>(`select count(*)::text count from public.${table}`);result[table]=Number(value.rows[0].count);}
  return result;
}
async function lookupId(client:Client,table:"categories"|"subcategories",name:string) {
  if(!name)return null;
  const existing=table==="categories"
    ? await client.query<{id:string}>("select id from public.categories where lower(btrim(name))=lower(btrim($1)) limit 1",[name])
    : await client.query<{id:string}>("select id from public.subcategories where lower(btrim(name))=lower(btrim($1)) limit 1",[name]);
  if(existing.rows[0])return existing.rows[0].id;
  if(table==="categories")return (await client.query<{id:string}>("insert into public.categories(name) values($1) returning id",[name])).rows[0].id;
  return (await client.query<{id:string}>("insert into public.subcategories(name) values($1) returning id",[name])).rows[0].id;
}
async function main() {
  const execute=process.argv.includes("--execute");
  const recordOnly=process.argv.includes("--record-only");
  const production=process.argv.includes("--production");
  const confirmedProject=process.argv.find(value=>value.startsWith("--confirm-project="))?.split("=",2)[1]??"";
  const cutoff=process.argv.find(value=>value.startsWith("--cutoff="))?.slice("--cutoff=".length)??"";
  const file=resolve(process.argv.find(value=>value.endsWith(".xlsx"))??"data/legacy/produk_final_stok_opname_gabungan.xlsx");
  const url=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL??"");
  const localHost=["127.0.0.1","localhost"].includes(url.hostname);
  if(!production&&!localHost)throw new Error("Ditolak: Supabase bukan localhost.");
  if(production&&(!execute||confirmedProject!=="xpnpctxpzvbaxalbhlfg"||cutoff!=="2026-11-08T08:00:00+07:00"))throw new Error("Ditolak: konfirmasi production/cutoff tidak lengkap.");
  const databaseUrl=process.env.SUPABASE_DB_URL?.trim()||(!production?`postgresql://postgres:postgres@${url.hostname}:54322/postgres`:"");
  const databaseHost=databaseUrl?new URL(databaseUrl).hostname:process.env.PGHOST??"";
  if(!production&&!["127.0.0.1","localhost"].includes(databaseHost))throw new Error("Ditolak: database bukan localhost.");
  if(production&&databaseHost!==`db.${confirmedProject}.supabase.co`)throw new Error("Ditolak: host database production tidak cocok.");
  const parsed=readRows(file);
  const preview={file,execute,sourceRows:parsed.sourceCount,products:parsed.rows.length,duplicatesSkipped:parsed.skippedDuplicate,generatedSkus:parsed.generated,validPrice:parsed.rows.filter(row=>row.price>0).length,withoutPrice:parsed.rows.filter(row=>row.price<=0).length,withoutUnit:parsed.rows.filter(row=>!row.unit).length,withoutStock:parsed.rows.filter(row=>row.stock===null).length,zeroStock:parsed.rows.filter(row=>row.stock===0).length};
  if(!execute){console.log(JSON.stringify(preview,null,2));return;}
  const client=new Client(databaseUrl?{connectionString:databaseUrl}:{ssl:{rejectUnauthorized:false}});await client.connect();
  try {
    await client.query("begin");
    if(production){
      await client.query("set local role postgres");
      const gate=Number((await client.query<{count:string}>("select count(*)::text count from pg_trigger where tgname='cutover_maintenance_guard_20261108' and not tgisinternal")).rows[0].count);
      if(gate!==OPERATIONAL_TABLES.length)throw new Error(`Maintenance gate tidak lengkap: ${gate}/${OPERATIONAL_TABLES.length}.`);
      const official=Number((await client.query<{count:string}>("select count(*)::text count from public.transactions where created_at >= $1::timestamptz",[cutoff])).rows[0].count);
      if(official>0)throw new Error(`STOP: ditemukan ${official} transaksi resmi sejak cutoff.`);
      await client.query("set local app.cutover_bypass='on'");
    }
    const host=(await client.query<{host:string}>("select coalesce(inet_server_addr()::text,'local') host")).rows[0].host;
    if(!production&&!host.startsWith("172.")&&!host.startsWith("127.")&&host!=="local")throw new Error("Ditolak: server database tidak terverifikasi lokal.");
    if(recordOnly){
      const count=Number((await client.query<{count:string}>("select count(*)::text count from public.products")).rows[0].count);
      if(count!==parsed.rows.length)throw new Error("Jumlah produk tidak cocok; riwayat import tidak dicatat.");
      const actor=(await client.query<{id:string}>("select id from public.employees where is_active and position='owner_admin' order by created_at,id limit 1")).rows[0];
      if(!actor)throw new Error("Owner aktif tidak ditemukan untuk mencatat riwayat import.");
      await client.query("insert into public.initial_product_import_requests(request_id,actor_id,payload,result) values(gen_random_uuid(),$1,$2::jsonb,$3::jsonb)",[actor.id,JSON.stringify(parsed.rows),JSON.stringify(preview)]);
      await client.query("commit");console.log(JSON.stringify({recordedImportHistory:true,products:count},null,2));return;
    }
    const deleted=await tableCounts(client);
    for(const table of OPERATIONAL_TABLES)await client.query(`delete from public.${table}`);
    for(const row of parsed.rows) {
      const categoryId=await lookupId(client,"categories",row.category);
      const subcategoryId=await lookupId(client,"subcategories",row.subcategory);
      const supplier=row.supplier?(await client.query<{id:string}>("select id from public.suppliers where is_active and lower(btrim(name))=lower(btrim($1)) order by id limit 1",[row.supplier])).rows[0]?.id??null:null;
      const classification=/resep|psikotropika/i.test(row.category)?"prescription_required":"otc";
      const product=(await client.query<{id:string}>(`insert into public.products(sku,name,category_id,subcategory_id,drug_classification,base_unit,cost_price,minimum_stock,default_supplier_id,is_active,unit_confirmed,classification_pending,legacy_supplier_text) values($1,$2,$3,$4,$5,$6,0,0,$7,true,$8,false,$9) returning id`,[row.sku,row.name,categoryId,subcategoryId,classification,row.unit||null,supplier,Boolean(row.unit),supplier?null:row.supplier||null])).rows[0];
      if(row.price>0)await client.query("insert into public.product_units(product_id,unit_name,conversion_to_base,selling_price,is_base_unit) values($1,$2,1,$3,$4)",[product.id,row.unit,row.price,Boolean(row.unit)]);
      if(row.stock!==null&&row.stock>0)await client.query("insert into public.product_batches(product_id,batch_number,expired_date,quantity,cost_price) values($1,$2,null,$3,0)",[product.id,`SO-${row.sku}`.slice(0,100),row.stock]);
    }
    const actor=(await client.query<{id:string}>("select id from public.employees where is_active and position='owner_admin' order by created_at,id limit 1")).rows[0];
    if(!actor)throw new Error("Owner aktif tidak ditemukan untuk mencatat riwayat import.");
    await client.query("insert into public.initial_product_import_requests(request_id,actor_id,payload,result) values(gen_random_uuid(),$1,$2::jsonb,$3::jsonb)",[actor.id,JSON.stringify(parsed.rows),JSON.stringify(preview)]);
    const finalCounts=await tableCounts(client);
    if(production){
      const expected={products:3693,product_units:3674,product_batches:1727,transactions:0};
      for(const [table,count] of Object.entries(expected))if(finalCounts[table]!==count)throw new Error(`Validasi gagal: ${table}=${finalCounts[table]}, expected ${count}.`);
      const prices=await client.query<{name:string;price:string}>("select p.name,max(u.selling_price)::text price from public.products p join public.product_units u on u.product_id=p.id where p.name=any($1::text[]) group by p.name",[["PANADOL 30 ML SYR","PANADOL ANAK TAB","PANADOL 60ML SYR","PANADOL BIRU"]]);
      const actual=new Map(prices.rows.map(row=>[row.name,Number(row.price)]));
      const expectedPrices=new Map([["PANADOL 30 ML SYR",32000],["PANADOL ANAK TAB",18000],["PANADOL 60ML SYR",58000],["PANADOL BIRU",15500]]);
      for(const [name,price] of expectedPrices)if(actual.get(name)!==price)throw new Error(`Validasi harga gagal: ${name}.`);
    }
    await client.query("commit");
    console.log(JSON.stringify({...preview,deleted,finalCounts,failedImport:0},null,2));
  } catch(error) {await client.query("rollback").catch(()=>undefined);throw error;} finally {await client.end();}
}

main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});

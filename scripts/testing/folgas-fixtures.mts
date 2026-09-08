import '../../server/src/bootstrap/load-env.js';
import {sql} from 'drizzle-orm';
import {randomBytes} from 'node:crypto';
import {writeFileSync,mkdirSync} from 'node:fs';
import {requireDb,closeDb} from '../../server/src/db/client.js';
import {hashPassword} from '../../server/src/lib/auth-password.js';
const db=requireDb();
const identity=await db.execute(sql`SELECT current_database() AS name`);
if(identity.rows[0].name!=='sirel_folgas_validation_20260908')throw Error('Somente banco isolado de smoke tests.');
const accounts=[];
await db.execute(sql`UPDATE folga_campanhas SET status='ARQUIVADA' WHERE nome='Folgas 7 de setembro — validação'`);
for(const [role,name] of [['admin','Admin Folgas'],['gestor','Gestor Folgas'],['user','Participante Um'],['user','Participante Dois'],['user','Não Participante']]) {
 const username='smoke_folgas_'+accounts.length;const password=randomBytes(16).toString('hex');
 const user=await db.execute(sql`INSERT INTO users (username,name,role,password_hash) VALUES (${username},${name},${role}::user_role,${hashPassword(password)}) ON CONFLICT(username) DO UPDATE SET password_hash=EXCLUDED.password_hash RETURNING id`);
 accounts.push({id:Number(user.rows[0].id),username,password,role});
}
const campaign=await db.execute(sql`INSERT INTO folga_campanhas (nome,ano,data_inicio,data_fim,selecao_inicio,selecao_fim,status,criado_por) VALUES ('Folgas 7 de setembro — validação',2026,'2026-09-08','2026-12-31','2026-09-08T00:00:00-03:00','2026-12-31T23:59:59-03:00','RASCUNHO',${accounts[0].id}) RETURNING id`);
const campaignId=Number(campaign.rows[0].id);
for(const user of accounts.slice(0,4))await db.execute(sql`INSERT INTO folga_participantes (campanha_id,user_id) VALUES (${campaignId},${user.id})`);
for(const [date,name] of [['2026-09-07','Independência do Brasil'],['2026-10-12','Nossa Senhora Aparecida'],['2026-11-02','Finados'],['2026-11-15','Proclamação da República'],['2026-11-20','Dia Nacional de Zumbi e da Consciência Negra'],['2026-12-25','Natal'],['2027-01-01','Confraternização Universal']])await db.execute(sql`INSERT INTO folga_dias_nao_uteis (campanha_id,data,tipo,descricao) VALUES (${campaignId},${date}::date,'FERIADO',${name})`);
mkdirSync('output/playwright',{recursive:true});writeFileSync('output/playwright/fixtures.json',JSON.stringify({accounts,campaignId}));
console.log({campaignId,accounts:accounts.length,status:'RASCUNHO'});await closeDb();

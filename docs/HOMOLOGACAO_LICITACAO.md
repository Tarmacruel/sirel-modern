# Homologação da entrada de processos na Licitação

| Configuração | Valor |
| --- | --- |
| Checkout | `D:\SIREL-TESTE` |
| Branch | `codex/sirel-licitacao-homologacao` |
| Endereço local | `http://localhost:2017` |
| Endereço externo | `https://teste.sirel.com.br` |
| Banco PostgreSQL | `sirel_teste`, com usuário próprio |

## Preparar no servidor Windows

Crie o banco local vazio `sirel_teste` com um usuário PostgreSQL dedicado que seja proprietário apenas desse banco. Use dados fictícios na homologação.

```powershell
git clone --branch codex/sirel-licitacao-homologacao https://github.com/Tarmacruel/sirel-modern.git D:\SIREL-TESTE
Set-Location D:\SIREL-TESTE
npm ci
```

Crie o arquivo `.env` nesse checkout com os valores abaixo. Informe as credenciais do banco de teste e gere um segredo de sessão exclusivo com pelo menos 32 caracteres aleatórios.

```dotenv
SIREL_HOMOLOGACAO=true
NODE_ENV=production
HOST=127.0.0.1
PORT=2017
CLIENT_URL=https://teste.sirel.com.br,http://localhost:2017
DATABASE_URL=postgresql://sirel_teste_usuario:SENHA_DO_BANCO@127.0.0.1:5432/sirel_teste
JWT_SECRET=SEGREDO_ALEATORIO_EXCLUSIVO_DE_HOMOLOGACAO
ARQUIVOS_ENABLED=false
ARQUIVOS_AUTO_INDEX=false
ARQUIVOS_WATCH=false
IMPORT_BLL_AUTOMATICA=false
BLL_SYNC_ENABLED=false
```

```powershell
npm run db:migrate
npm run build
$senhaTeste = Read-Host 'Senha inicial de admin.teste (mínimo de 16 caracteres)' -AsSecureString
$env:SIREL_TESTE_ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $senhaTeste).Password
try {
  node --env-file=.env server/dist/server/src/scripts/seed-homologacao.js
} finally {
  Remove-Item Env:SIREL_TESTE_ADMIN_PASSWORD
  Remove-Variable senhaTeste
}
node --env-file=.env server/dist/server/src/index.js
```

Mantenha o processo em execução durante a homologação. Em outro terminal, confira `curl.exe http://localhost:2017/healthz`.

## Publicar no túnel

Na aplicação publicada do túnel deste computador, configure o hostname `teste.sirel.com.br` com destino `http://localhost:2017`, como no formulário apresentado. Abra `https://teste.sirel.com.br/healthz` e acesse o login com `admin.teste`.

## Conferir o fluxo

1. Abra **Licitação** e selecione **Receber processo**.
2. Registre um processo fictício recebido de Compras. Repita com outro número e origem Planejamento.
3. Confirme que cada processo abre em **Preparação**, aparece na fila e registra a origem no histórico.
4. Reenvie o mesmo número administrativo e ano. A tela deve indicar o número SIREL do cadastro existente.
5. No desktop e no celular, abra a **Próxima ação** e conclua um requisito de teste. Confira a atualização do progresso.

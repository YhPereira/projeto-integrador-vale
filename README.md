# Vale Localiza — versão com SQLite

## O que foi implementado
- Banco SQLite criado automaticamente em `vale.db`.
- Estrutura de funcionários, localizações, status, itens e movimentações baseada no arquivo SQL enviado.
- Busca por código/nome/localização com filtros de categoria, galpão e status.
- Retirada validando matrícula cadastrada e ativa; item passa para `EM_USO` e recebe responsável.
- Devolução, envio/retorno de manutenção, marcação de perdido e localização de item.
- Histórico de movimentações gravado no banco.
- Relatórios por status e itens atualmente em uso via API.

## Importante
O arquivo SQL original tinha o cabeçalho `CREATE TABLE funcionarios (` ausente. Foi corrigido no `schema.sql` para que o banco possa ser criado. A estrutura e os estados definidos no arquivo foram mantidos.
A categoria não existe como coluna no SQL enviado; para o filtro visual, ela é inferida pelo prefixo do código (ex.: `FER-` = Ferramentas). Se quiser categorias oficiais no banco, adicione uma coluna `categoria` à tabela `itens`.
O banco inclui sete funcionários e cinco itens de exemplo. A retirada exige a matrícula de um colaborador cadastrado e ativo; os exemplos de matrículas começam em `8820`.
Os dados são armazenados no arquivo local `vale.db`, não em um servidor compartilhado. Esta versão é adequada para demonstração/desenvolvimento, não para implantação operacional sem autenticação, permissões e revisão de segurança.

## Como executar no Windows
1. Instale Python 3.10 ou mais recente.
2. Extraia o ZIP para uma pasta.
3. Abra a pasta no Explorador de Arquivos.
4. Execute `iniciar.bat`.
5. Abra `http://127.0.0.1:5000` no navegador.

Na primeira execução, o programa instala o Flask se necessário e cria o banco `vale.db`. As próximas inicializações não apagam dados existentes; o esquema e os dados de exemplo são aplicados de forma idempotente.
Para iniciar manualmente:
```bash
pip install -r requirements.txt
python app.py
```

## Rotas principais da API
- `GET /api/items`
- `GET /api/items?q=FER-992`
- `GET /api/movements`
- `GET /api/statuses`
- `GET /api/reports`
- `GET /api/employees/8820`
- `POST /api/items/FER-992/action` com JSON `{"action":"withdraw","matricula":8820}`

Ações permitidas: `withdraw`, `return`, `maintenance`, `maintenance_return`, `lost`, `found`.

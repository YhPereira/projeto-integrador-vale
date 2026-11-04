PRAGMA foreign_keys = ON;   -- faz o SQLite respeitar as chaves estrangeiras
 
-- ---------------------------------------------------------------------
-- 1. FUNCIONÁRIOS: quem pode retirar ferramentas (a matrícula identifica)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS funcionarios (
  matricula INTEGER PRIMARY KEY,                                   -- ex.: 8820 (não repete)
  nome      TEXT    NOT NULL CHECK (length(trim(nome)) > 0),       -- ex.: Yuri Silva
  ativo     INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1))     -- 1 = ativo, 0 = desligado
);
 
-- ---------------------------------------------------------------------
-- 2. LOCALIZAÇÕES: endereço exato, do galpão até a caixa
--    Ex.: Galpão 03 > Corredor B > Prateleira 04 > Caixa 12
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS localizacoes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  galpao     TEXT NOT NULL,
  corredor   TEXT NOT NULL,
  prateleira TEXT NOT NULL,
  caixa      TEXT NOT NULL DEFAULT 'Sem caixa',
  UNIQUE (galpao, corredor, prateleira, caixa)
);
 
-- ---------------------------------------------------------------------
-- 3. STATUS DO ITEM: a REGRA DO ESTOQUE em forma de dados
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS status_item (
  status    TEXT PRIMARY KEY,
  descricao TEXT NOT NULL,
  cor       TEXT NOT NULL
);
 
INSERT OR IGNORE INTO status_item (status, descricao, cor) VALUES
  ('DISPONIVEL',    'Está guardado no local e pode ser retirado',           'VERDE'),
  ('EM_USO',        'Foi retirado e está com um responsável',               'AMARELO'),
  ('EM_MANUTENCAO', 'Está em reparo ou calibração e não pode ser retirado', 'LARANJA'),
  ('PERDIDO',       'Não foi devolvido ou não foi encontrado no inventário', 'VERMELHO');
 
-- ---------------------------------------------------------------------
-- 4. ITENS: o cadastro de todos os equipamentos da empresa
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS itens (
  codigo                TEXT    PRIMARY KEY,                -- ex.: FER-992
  nome                  TEXT    NOT NULL,                   -- ex.: Chave Dinamométrica 1/2"
  localizacao_id        INTEGER NOT NULL,                   -- onde ele fica guardado
  status                TEXT    NOT NULL DEFAULT 'DISPONIVEL',
  responsavel_matricula INTEGER,                            -- quem está com ele agora
 
  FOREIGN KEY (localizacao_id)        REFERENCES localizacoes (id),
  FOREIGN KEY (status)                REFERENCES status_item (status),
  FOREIGN KEY (responsavel_matricula) REFERENCES funcionarios (matricula),
 
  CHECK (
    (status = 'EM_USO' AND responsavel_matricula IS NOT NULL)
    OR (status <> 'EM_USO' AND responsavel_matricula IS NULL)
  )
);
 
-- ---------------------------------------------------------------------
-- 5. MOVIMENTAÇÕES: histórico de tudo que aconteceu com cada item
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS movimentacoes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  item_codigo TEXT    NOT NULL,
  tipo        TEXT    NOT NULL,
  matricula   INTEGER NOT NULL,                             -- quem fez a operação
  data_hora   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  observacao  TEXT,
 
  FOREIGN KEY (item_codigo) REFERENCES itens (codigo),
  FOREIGN KEY (matricula)   REFERENCES funcionarios (matricula),
  CHECK (tipo IN (
    'RETIRADA', 'DEVOLUCAO', 'ENVIO_MANUTENCAO',
    'RETORNO_MANUTENCAO', 'MARCADO_PERDIDO', 'LOCALIZADO'
  ))
);
 
-- ---------------------------------------------------------------------
-- 6. VISÕES
-- ---------------------------------------------------------------------
CREATE VIEW IF NOT EXISTS itens_por_prateleira AS
SELECT l.galpao, l.corredor, l.prateleira, l.caixa,
       i.codigo, i.nome, i.status
FROM localizacoes l
LEFT JOIN itens i ON i.localizacao_id = l.id
ORDER BY l.galpao, l.corredor, l.prateleira, l.caixa, i.codigo;
 
CREATE VIEW IF NOT EXISTS resumo_por_prateleira AS
SELECT l.galpao, l.corredor, l.prateleira,
       COUNT(i.codigo) AS total_itens,
       COALESCE(GROUP_CONCAT(i.codigo || ' - ' || i.nome, '; '), 'Prateleira vazia') AS itens
FROM localizacoes l
LEFT JOIN itens i ON i.localizacao_id = l.id
GROUP BY l.galpao, l.corredor, l.prateleira
ORDER BY l.galpao, l.corredor, l.prateleira;
 
-- =====================================================================
-- DADOS DE EXEMPLO - EQUIPE
-- =====================================================================
-- Adicionando todos os membros da equipe informados
INSERT OR IGNORE INTO funcionarios (matricula, nome) VALUES (8820, 'Yuri Silva');
INSERT OR IGNORE INTO funcionarios (matricula, nome) VALUES (8821, 'Davi Locatel');
INSERT OR IGNORE INTO funcionarios (matricula, nome) VALUES (8822, 'Yuri honorato');
INSERT OR IGNORE INTO funcionarios (matricula, nome) VALUES (8823, 'anne beatriz');
INSERT OR IGNORE INTO funcionarios (matricula, nome) VALUES (8824, 'wemilly vitoria');
INSERT OR IGNORE INTO funcionarios (matricula, nome) VALUES (8825, 'filipe rodrigues');
INSERT OR IGNORE INTO funcionarios (matricula, nome) VALUES (8826, 'Bruna weerds');
 
-- =====================================================================
-- DADOS DE EXEMPLO - LOCALIZAÇÕES (GALPÕES 01 a 05)
-- =====================================================================
INSERT OR IGNORE INTO localizacoes (galpao, corredor, prateleira, caixa) VALUES
  ('Galpão 01', 'Corredor A', 'Prateleira 01', 'Caixa 01'),
  ('Galpão 02', 'Corredor C', 'Prateleira 02', 'Caixa 01'),
  
  -- Galpão 03 com as 12 prateleiras para bater com a interface do Front-End
  ('Galpão 03', 'Corredor B', 'Prateleira 01', 'Caixa 01'),
  ('Galpão 03', 'Corredor B', 'Prateleira 02', 'Caixa 01'),
  ('Galpão 03', 'Corredor B', 'Prateleira 03', 'Caixa 01'),
  ('Galpão 03', 'Corredor B', 'Prateleira 04', 'Caixa 12'),
  ('Galpão 03', 'Corredor B', 'Prateleira 04', 'Caixa 13'),
  ('Galpão 03', 'Corredor B', 'Prateleira 05', 'Caixa 01'),
  ('Galpão 03', 'Corredor B', 'Prateleira 06', 'Caixa 01'),
  ('Galpão 03', 'Corredor B', 'Prateleira 07', 'Caixa 01'),
  ('Galpão 03', 'Corredor B', 'Prateleira 08', 'Caixa 01'),
  ('Galpão 03', 'Corredor B', 'Prateleira 09', 'Caixa 01'),
  ('Galpão 03', 'Corredor B', 'Prateleira 10', 'Caixa 01'),
  ('Galpão 03', 'Corredor B', 'Prateleira 11', 'Caixa 01'),
  ('Galpão 03', 'Corredor B', 'Prateleira 12', 'Caixa 01'),

  -- Adicionando mais 2 galpões conforme solicitado
  ('Galpão 04', 'Corredor D', 'Prateleira 01', 'Caixa 01'),
  ('Galpão 05', 'Corredor E', 'Prateleira 01', 'Caixa 01');
 
-- =====================================================================
-- DADOS DE EXEMPLO - ITENS
-- =====================================================================
INSERT OR IGNORE INTO itens (codigo, nome, localizacao_id) VALUES
  ('FER-992', 'Chave Dinamométrica 1/2"',
     (SELECT id FROM localizacoes WHERE galpao = 'Galpão 03' AND corredor = 'Corredor B' AND prateleira = 'Prateleira 04' AND caixa = 'Caixa 12')),
  ('FER-101', 'Alicate Universal 8"',
     (SELECT id FROM localizacoes WHERE galpao = 'Galpão 03' AND corredor = 'Corredor B' AND prateleira = 'Prateleira 04' AND caixa = 'Caixa 13')),
  ('FER-215', 'Furadeira de Impacto 1/2"',
     (SELECT id FROM localizacoes WHERE galpao = 'Galpão 03' AND corredor = 'Corredor B' AND prateleira = 'Prateleira 05' AND caixa = 'Caixa 01')),
  ('FER-310', 'Trena 5 m',
     (SELECT id FROM localizacoes WHERE galpao = 'Galpão 01' AND corredor = 'Corredor A' AND prateleira = 'Prateleira 01' AND caixa = 'Caixa 01')),
  ('FER-411', 'Multímetro Digital',
     (SELECT id FROM localizacoes WHERE galpao = 'Galpão 01' AND corredor = 'Corredor A' AND prateleira = 'Prateleira 01' AND caixa = 'Caixa 01'));
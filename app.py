from flask import Flask, jsonify, request, send_from_directory
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "vale.db"
app = Flask(__name__, static_folder="static", static_url_path="")

STATUS_LABELS = {
    "DISPONIVEL": "Disponível",
    "EM_USO": "Em Uso",
    "EM_MANUTENCAO": "Em Manutenção",
    "PERDIDO": "Perdido",
}
STATUS_COLORS = {
    "DISPONIVEL": "VERDE",
    "EM_USO": "AMARELO",
    "EM_MANUTENCAO": "LARANJA",
    "PERDIDO": "VERMELHO",
}
CATEGORY_BY_PREFIX = {
    "FER": "Ferramentas",
    "PEC": "Peças",
    "EQU": "Equipamentos",
    "EPI": "EPIs",
    "ELE": "Elétrica",
    "HID": "Hidráulica",
}
ACTION_TYPES = {
    "withdraw": ("DISPONIVEL", "EM_USO", "RETIRADA"),
    "return": ("EM_USO", "DISPONIVEL", "DEVOLUCAO"),
    "maintenance": ("DISPONIVEL", "EM_MANUTENCAO", "ENVIO_MANUTENCAO"),
    "maintenance_return": ("EM_MANUTENCAO", "DISPONIVEL", "RETORNO_MANUTENCAO"),
    "lost": (None, "PERDIDO", "MARCADO_PERDIDO"),
    "found": ("PERDIDO", "DISPONIVEL", "LOCALIZADO"),
}

def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def initialize_db():
    with connect() as conn:
        conn.executescript((ROOT / "schema.sql").read_text(encoding="utf-8"))

def category_for(code):
    return CATEGORY_BY_PREFIX.get(code.split("-", 1)[0].upper(), "Outros")

def row_to_item(row):
    code = row["codigo"]
    return {
        "code": code,
        "name": row["nome"],
        "cat": category_for(code),
        "sector": row["galpao"],
        "status": STATUS_LABELS[row["status"]],
        "statusCode": row["status"],
        "statusColor": STATUS_COLORS[row["status"]],
        "loc": f'{row["galpao"]} › {row["corredor"]} › {row["prateleira"]} › {row["caixa"]}',
        "galpao": row["galpao"],
        "corredor": row["corredor"],
        "prateleira": row["prateleira"],
        "caixa": row["caixa"],
        "employee": str(row["responsavel_matricula"] or ""),
        "employeeName": row["responsavel_nome"] or "",
    }

def get_items(q="", category="", sector="", status=""):
    sql = """
    SELECT i.codigo, i.nome, i.status, i.responsavel_matricula,
           l.galpao, l.corredor, l.prateleira, l.caixa,
           f.nome AS responsavel_nome
    FROM itens i
    JOIN localizacoes l ON l.id = i.localizacao_id
    LEFT JOIN funcionarios f ON f.matricula = i.responsavel_matricula
    WHERE 1=1
    """
    args = []
    if q:
        sql += " AND (i.codigo LIKE ? OR i.nome LIKE ? OR l.galpao LIKE ? OR l.corredor LIKE ? OR l.prateleira LIKE ? OR l.caixa LIKE ?)"
        pattern = f"%{q}%"
        args.extend([pattern] * 6)
    if sector:
        sql += " AND l.galpao = ?"
        args.append(sector)
    if status:
        code = next((k for k, v in STATUS_LABELS.items() if v.lower() == status.lower() or k.lower() == status.lower()), status.upper())
        sql += " AND i.status = ?"
        args.append(code)
    sql += " ORDER BY i.codigo"
    with connect() as conn:
        rows = conn.execute(sql, args).fetchall()
    items = [row_to_item(r) for r in rows]
    if category:
        items = [i for i in items if i["cat"].lower() == category.lower()]
    return items

@app.get("/")
def home():
    return send_from_directory(app.static_folder, "index.html")

@app.get("/api/items")
def api_items():
    return jsonify(get_items(
        q=request.args.get("q", "").strip(),
        category=request.args.get("category", "").strip(),
        sector=request.args.get("sector", "").strip(),
        status=request.args.get("status", "").strip()
    ))

@app.get("/api/warehouses")
def api_warehouses():
    with connect() as conn:
        rows = conn.execute("SELECT DISTINCT galpao FROM localizacoes ORDER BY galpao").fetchall()
    return jsonify([row["galpao"] for row in rows])

@app.get("/api/items/<code>")
def api_item(code):
    found = get_items(q=code)
    item = next((i for i in found if i["code"].lower() == code.lower()), None)
    if not item:
        return jsonify({"error": "Material não encontrado."}), 404
    return jsonify(item)

@app.get("/api/movements")
def api_movements():
    with connect() as conn:
        rows = conn.execute("""
          SELECT m.id, m.item_codigo, i.nome AS item_nome, m.tipo, m.matricula,
                 f.nome AS funcionario_nome, m.data_hora, m.observacao,
                 l.galpao, l.corredor, l.prateleira, l.caixa
          FROM movimentacoes m
          JOIN itens i ON i.codigo = m.item_codigo
          JOIN funcionarios f ON f.matricula = m.matricula
          JOIN localizacoes l ON l.id = i.localizacao_id
          ORDER BY m.id DESC LIMIT 100
        """).fetchall()
    type_labels = {
        "RETIRADA": "Retirada", "DEVOLUCAO": "Devolução",
        "ENVIO_MANUTENCAO": "Envio à manutenção",
        "RETORNO_MANUTENCAO": "Retorno da manutenção",
        "MARCADO_PERDIDO": "Marcado como perdido", "LOCALIZADO": "Item localizado"
    }
    return jsonify([{
        "date": r["data_hora"], "item": f'{r["item_nome"]} ({r["item_codigo"]})',
        "type": type_labels.get(r["tipo"], r["tipo"]),
        "location": f'{r["galpao"]} › {r["corredor"]} › {r["prateleira"]} › {r["caixa"]}',
        "employee": f'{r["funcionario_nome"]} ({r["matricula"]})',
        "note": r["observacao"] or ""
    } for r in rows])

@app.get("/api/statuses")
def api_statuses():
    with connect() as conn:
        rows = conn.execute("SELECT status, descricao, cor FROM status_item ORDER BY status").fetchall()
        counts = {r["status"]: r["total"] for r in conn.execute("SELECT status, COUNT(*) AS total FROM itens GROUP BY status")}
    return jsonify([{
        "code": r["status"], "label": STATUS_LABELS[r["status"]],
        "description": r["descricao"], "color": r["cor"],
        "total": counts.get(r["status"], 0)
    } for r in rows])

@app.get("/api/employees/<int:matricula>")
def api_employee(matricula):
    with connect() as conn:
        row = conn.execute("SELECT matricula, nome, ativo FROM funcionarios WHERE matricula = ?", (matricula,)).fetchone()
    if not row:
        return jsonify({"error": "Matrícula não cadastrada."}), 404
    if not row["ativo"]:
        return jsonify({"error": "Este colaborador está inativo."}), 403
    return jsonify({"matricula": row["matricula"], "nome": row["nome"], "ativo": bool(row["ativo"])})

@app.post("/api/items/<code>/action")
def api_action(code):
    data = request.get_json(silent=True) or {}
    action = data.get("action", "")
    matricula = data.get("matricula")
    observacao = (data.get("observacao") or "").strip() or None
    if action not in ACTION_TYPES:
        return jsonify({"error": "Ação inválida."}), 400
    try:
        matricula = int(matricula)
    except (TypeError, ValueError):
        return jsonify({"error": "Informe uma matrícula válida."}), 400

    expected, target, movement = ACTION_TYPES[action]
    try:
        with connect() as conn:
            employee = conn.execute(
                "SELECT matricula, nome, ativo FROM funcionarios WHERE matricula = ?", (matricula,)
            ).fetchone()
            if not employee:
                return jsonify({"error": "Matrícula não cadastrada no sistema."}), 404
            if employee["ativo"] != 1:
                return jsonify({"error": "Colaborador inativo. A operação não foi realizada."}), 403

            item = conn.execute("SELECT codigo, nome, status, responsavel_matricula FROM itens WHERE codigo = ?", (code,)).fetchone()
            if not item:
                return jsonify({"error": "Material não encontrado."}), 404

            current = item["status"]
            if action == "lost":
                if current not in ("DISPONIVEL", "EM_USO"):
                    return jsonify({"error": "Só é possível marcar como perdido um item Disponível ou Em Uso."}), 409
            elif current != expected:
                return jsonify({"error": f'Operação não permitida. Status atual: {STATUS_LABELS[current]}.'}), 409

            if action == "withdraw":
                conn.execute("UPDATE itens SET status = ?, responsavel_matricula = ? WHERE codigo = ?", (target, matricula, code))
            elif action in ("return", "lost"):
                conn.execute("UPDATE itens SET status = ?, responsavel_matricula = NULL WHERE codigo = ?", (target, code))
            else:
                conn.execute("UPDATE itens SET status = ?, responsavel_matricula = NULL WHERE codigo = ?", (target, code))

            conn.execute(
                "INSERT INTO movimentacoes (item_codigo, tipo, matricula, observacao) VALUES (?, ?, ?, ?)",
                (code, movement, matricula, observacao)
            )
            updated = conn.execute("""
              SELECT i.codigo, i.nome, i.status, i.responsavel_matricula,
                     l.galpao, l.corredor, l.prateleira, l.caixa,
                     f.nome AS responsavel_nome
              FROM itens i JOIN localizacoes l ON l.id = i.localizacao_id
              LEFT JOIN funcionarios f ON f.matricula = i.responsavel_matricula
              WHERE i.codigo = ?
            """, (code,)).fetchone()
            result = row_to_item(updated)
            return jsonify({"message": f'{movement.replace("_", " ").title()} registrado com sucesso.', "item": result})
    except sqlite3.IntegrityError as exc:
        return jsonify({"error": f"Não foi possível registrar a operação: {exc}"}), 400

@app.get("/api/reports")
def api_reports():
    with connect() as conn:
        counts = conn.execute("SELECT status, COUNT(*) AS total FROM itens GROUP BY status").fetchall()
        in_use = conn.execute("""
          SELECT f.matricula, f.nome, i.codigo, i.nome AS item
          FROM itens i JOIN funcionarios f ON f.matricula = i.responsavel_matricula
          WHERE i.status = 'EM_USO'
        """).fetchall()
    return jsonify({
        "counts": [{"status": STATUS_LABELS[r["status"]], "total": r["total"]} for r in counts],
        "inUse": [dict(r) for r in in_use]
    })

if __name__ == "__main__":
    initialize_db()
    print(f"Vale Localiza iniciado. Banco SQLite: {DB_PATH}")
    app.run(debug=True)

import sqlite3
import json 
from pathlib import Path
from datetime import date, datetime   

DB_PATH = Path(__file__).parent / "chess.db"

def get_con():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con

def init_db():
    con = get_con()
    with con:
        con.executescript("""
            CREATE TABLE IF NOT EXISTS games (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                pgn             TEXT,
                player_white    TEXT,
                player_black    TEXT,
                result          TEXT,
                plataform       TEXT,
                source          TEXT,
                time_control    TEXT,
                date            TEXT,
                imported_at     TEXT
            );

            CREATE TABLE IF NOT EXISTS moves (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id         INTEGER REFERENCES games (id),
                move_number     INTEGER,
                color           TEXT,
                san             TEXT,
                fen_before      TEXT,
                eval_before     REAL,
                eval_after      REAL,
                best_move       TEXT,
                best_move_san   TEXT,
                classification  TEXT,
                cp_loss         REAL,
                phase           TEXT,
                mate_in         INTEGER default NULL
            );                       

            CREATE TABLE IF NOT EXISTS player_stats (
                player_name      TEXT PRIMARY KEY,
                games_analyzed     INTEGER DEFAULT 0,
                avg_cp_loss    REAL DEFAULT 0,
                weak_phases    TEXT DEFAULT '{}'
            );

        """)
        try:
            con.execute("ALTER TABLE moves ADD COLUMN is_brilliant INTEGER DEFAULT 0")
        except sqlite3.OperationalError:
            pass

    con.close()

def save_game(pgn, player_white, player_black, result, plataform, source, time_control, date):
    con = get_con()
    with con:
        cur = con.execute("""
            INSERT INTO games (pgn, player_white, player_black, result, plataform, source, time_control, date, imported_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (pgn, player_white, player_black, result, plataform, source, time_control, date, datetime.now().isoformat()))
        return cur.lastrowid
    
def get_games(limit=20, offset=0):
    con = get_con()
    rows = con.execute("""
        SELECT * FROM games ORDER BY imported_at DESC LIMIT ? OFFSET ?
    """, (limit, offset))
    return [dict(row) for row in rows.fetchall()]

def save_moves(game_id, moves):
    con = get_con()
    with con:
        for move in moves:
            con.execute("""
                INSERT INTO moves (game_id, move_number, color, san, fen_before, eval_before, eval_after, best_move, best_move_san, classification, cp_loss, phase, mate_in, is_brilliant)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,  (
                game_id, 
                move["move_number"], 
                move["color"], 
                move["san"], 
                move["fen_before"], 
                move["eval_before"], 
                move["eval_after"], 
                move.get("best_move"),
                move.get("best_move_san"),
                move["classification"], 
                move["cp_loss"], 
                move.get("phase", ""),
                move.get("mate_in"),
                int(move.get("is_brilliant", False))
            ))
            
def get_game(game_id):
    con = get_con()
    row = con.execute("SELECT * FROM games WHERE id = ?", (game_id,)).fetchone()
    return dict(row) if row else None

def delete_moves(game_id):
    con = get_con()
    with con:
        con.execute("DELETE FROM moves WHERE game_id = ?", (game_id,))

def delete_game(game_id):
    con = get_con()
    with con:
        con.execute("DELETE FROM moves WHERE game_id = ?", (game_id,))
        con.execute("DELETE FROM games WHERE id = ?", (game_id,))
    con.close()


import uuid

from fastapi import FastAPI, BackgroundTasks
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from database.db import init_db, save_game
from engine.importers import from_lichess
from engine.analyzer import analyze_game
from database.db import get_game, save_moves, delete_moves, delete_game
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

init_db()
jobs = {}

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/", response_class=HTMLResponse)
def root():
    return FileResponse("templates/index.html")

class ImportRequest(BaseModel):
    username: str
    max_games: int = 100
    
@app.post("/api/import/lichess")
def import_lichess(req: ImportRequest, background_tasks: BackgroundTasks):
    job_id = len(jobs) + 1
    jobs[job_id] = {"status": "running"}

    def run():
        try:
            games = from_lichess(req.username, req.max_games)
            for game in games:
                save_game(          
                    pgn=game["pgn"],
                    player_white=game["player_white"],
                    player_black=game["player_black"],
                    result=game["result"],
                    plataform=game.get("plataform", "lichess"),
                    source=req.username,
                    time_control=game.get("time_control", ""),
                    date=game.get("date", "")
                )
            jobs[job_id]["status"] = "completed"
        except Exception as e:
            jobs[job_id]["status"] = f"error: {str(e)}"
    background_tasks.add_task(run)

    return {"job_id": job_id}

@app.get("/api/jobs/{job_id}")
def get_job(job_id: str):
    job = jobs.get(job_id)
    if not job:
        return {"error": "Job não encontrado"}
    return job

@app.get("/api/games")
def list_games(offset: int = 0, limit: int = 20):
    from database.db import get_games
    games = get_games(limit=limit, offset=offset)
    has_more = len(games) == limit
    return {"games": games, "has_more": has_more}

@app.post("/api/analyze/{game_id}")
def analyze(game_id: int, background_tasks: BackgroundTasks):
    game = get_game(game_id)
    if not game:
        return {"error": "Partida não encontrada"}
    
    job_id = str(uuid.uuid4())[:8]
    jobs[job_id] = {"status": "running", "progress": 0, "total": 0}

    def run():
        try:
            def on_progress(current, total):
                jobs[job_id]["progress"] = current
                jobs[job_id]["total"] = total
            results = analyze_game(game["pgn"], on_progress=on_progress)
            delete_moves(game_id)  
            save_moves(game_id, results)
            jobs[job_id]["status"] = "completed"
        except Exception as e:
            jobs[job_id]["status"] = f"error: {str(e)}"

    background_tasks.add_task(run)
    return {"job_id": job_id}

@app.delete("/api/games/{game_id}")
def remove_game(game_id: int):
    game = get_game(game_id)
    if not game:
        return {"error": "Partida não encontrada"}
    delete_game(game_id)
    return {"deleted": True}

@app.get("/api/games/{game_id}/moves")
def get_moves(game_id: int):
    from database.db import get_con
    con = get_con()
    rows = con.execute("SELECT * FROM moves WHERE game_id = ?", (game_id,)).fetchall()
    return {"moves": [dict(r) for r in rows]}

class PGNImportRequest(BaseModel):
    pgn: str

@app.post("/api/import/pgn")
def import_pgn(req: PGNImportRequest):
    from engine.importers import import_pgn as parse_pgn
    try:
        games = parse_pgn(req.pgn)
        ids = []
        for game in games:
            gid = save_game(
                pgn=game["pgn"],
                player_white=game["player_white"],
                player_black=game["player_black"],
                result=game["result"],
                plataform=game.get("plataform", "manual"),
                source="pgn",
                time_control=game.get("time_control", ""),
                date=game.get("date", "")
            )
            ids.append(gid)
        return {"imported": len(ids), "ids": ids}
    except Exception as e:
        return {"error": str(e)}
    
class EvaluateRequest(BaseModel):
    fen: str

@app.post("/api/evaluate")
def evaluate(req: EvaluateRequest):
    from engine.analyzer import evaluate_position
    try:
        return evaluate_position(req.fen)
    except Exception as e:
        return {"error": str(e)}
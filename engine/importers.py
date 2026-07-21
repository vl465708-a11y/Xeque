
import io
import requests
import chess
import chess.pgn


def import_pgn(pgn_text):
    games = []
    stream = io.StringIO(pgn_text)
    while True:
        game = chess.pgn.read_game(stream)
        if game is None:
            break
        games.append({
            "pgn": str(game),
            "player_white": game.headers.get("White", "?"),
            "player_black": game.headers.get("Black", "?"),
            "result": game.headers.get("Result", "*"),
            "plataform": game.headers.get("Site", "*"),
            "date": game.headers.get("Date", "*"),
        })

    return games

def from_lichess(username, max_games=50):
    headers = {
        "Accept": "application/x-chess-pgn"
    }
    resp = requests.get(f"https://lichess.org/api/games/user/{username}", headers=headers, params={"max": max_games})
    return import_pgn(resp.text)

def from_chesscom(username, max_games=50):
    headers = {"User-Agent": "ChessAnalyzer/1.0"}
    resp = requests.get(f"https://api.chess.com/pub/player/{username}/games/archives", headers=headers)
    if resp.status_code != 200:
        raise Exception(f"Chess.com bloqueou a requisição (status {resp.status_code}). Use a Lichess ou importe PGN manualmente.")
    archives = resp.json().get("archives", [])
    games = []
    for archive in reversed(archives):
        if len(games) >= max_games:
            break
        resp = requests.get(archive, headers=headers)
        games.extend(import_pgn(resp.text))
    return games[:max_games]



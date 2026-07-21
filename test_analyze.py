from engine.analyzer import analyze_game
from engine.importers import from_lichess
from engine.importers import from_chesscom

    #pgn = """[Event "Test"]
    #[White "Magnus"]
    #[Black "Hikaru"]
    #[Result "*"]

    #1. e4 e5 2. Nf3 Nc6 *
    #"""

    #results = analyze_game(pgn)
    #for r in results:
        #print(r['move_number'], r['color'], r['san'], r['classification'])

    #games = from_lichess("DrNykterstein", max_games=5)
    #for g in games:
        #print(g["player_white"], "vs", g["player_black"], g["result"])



games = from_chesscom("hikaru", max_games=5)
for g in games:
    print(g["player_white"], "vs", g["player_black"], g["result"]) 
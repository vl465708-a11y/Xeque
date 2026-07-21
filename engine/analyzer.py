import io
import chess, chess.pgn, chess.engine
import os

import os

STOCKFISH_PATH = os.environ.get("STOCKFISH_PATH", r"D:\stockfish\stockfish-windows-x86-64-avx2.exe")
DEPTH = int(os.environ.get("STOCKFISH_DEPTH", 16))

def classify(cp_loss):
    if cp_loss >= 200:
        return "blunder"
    elif cp_loss >= 100:
        return "mistake"
    elif cp_loss >= 50:
        return "inaccuracy"
    elif cp_loss > 5:
        return "good"
    else:
        return "best"

def get_eval(score_obj):
    score = score_obj.white()
    if score.is_mate():
        cp = 10000 if score.mate() > 0 else -10000
        return cp, score.mate()
    return score.score(), None

def analyze_game(pgn_text, on_progress=None):
    game = chess.pgn.read_game(io.StringIO(pgn_text))
    board = game.board()
    moves = list(game.mainline_moves())
    engine = chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH)

    results = []

    # analisa posição inicial uma vez
    info = engine.analyse(board, chess.engine.Limit(depth=DEPTH))
    eval_current, mate_current = get_eval(info["score"])

    for i, move in enumerate(moves):
        print(f"Analisando lance {i+1}/{len(moves)}...", flush=True)
        if on_progress:
            on_progress(i + 1, len(moves))
            
        color = "white" if board.turn == chess.WHITE else "black"
        fen_before = board.fen()
        eval_before = eval_current
        mate_before = mate_current

        # pega o melhor lance ANTES de executar o movimento
        best_move = info["pv"][0] if "pv" in info else None
        best_move_san = board.san(best_move) if best_move else None

        san = board.san(move)
        board.push(move)

        # analisa posição DEPOIS — vira o eval_before do próximo lance
        info = engine.analyse(board, chess.engine.Limit(depth=DEPTH))
        eval_current, mate_current = get_eval(info["score"])
        eval_after = eval_current
        mate_in = mate_current

        if color == "white":
            cp_loss = max(0, (eval_before or 0) - (eval_after or 0))
        else:
            cp_loss = max(0, (eval_after or 0) - (eval_before or 0))

        classification = classify(cp_loss)

        is_brilliant = False
        if classification in ("best", "good"):
            mover_eval_after = eval_after if color == "white" else (
                -eval_after if eval_after is not None else None
            )
            not_already_crushing = abs(eval_before or 0) < 400
            still_okay_after = mover_eval_after is not None and mover_eval_after > -100

            if not_already_crushing and still_okay_after:
                board_before_move = chess.Board(fen_before)
                is_brilliant = detect_sacrifice(board_before_move, move,)

        results.append({
            "move_number": i + 1,
            "color": color,
            "san": san,
            "fen_before": fen_before,
            "eval_before": eval_before,
            "eval_after": eval_after,
            "best_move": best_move.uci() if best_move else None,
            "best_move_san": best_move_san,
            "classification": classification,
            "cp_loss": cp_loss,
            "mate_in": mate_in,
            "is_brilliant": is_brilliant,
        })

    engine.quit()
    return results


EXPLORE_DEPTH = 12  

def evaluate_position(fen):
    board = chess.Board(fen)
    engine = chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH)
    try:
        info = engine.analyse(board, chess.engine.Limit(depth=EXPLORE_DEPTH))
        eval_cp, mate_in = get_eval(info["score"])
        best_move = info["pv"][0] if "pv" in info else None
        best_move_san = board.san(best_move) if best_move else None
        return {
            "eval": eval_cp,
            "mate_in": mate_in,
            "best_move": best_move.uci() if best_move else None,
            "best_move_san": best_move_san,
        }
    finally:
        engine.quit()

PIECE_VALUES = {
    chess.PAWN: 1,
    chess.KNIGHT: 3,
    chess.BISHOP: 3,
    chess.ROOK: 5,
    chess.QUEEN: 9,
    chess.KING: 0,
}

def detect_sacrifice(board_before_move, move):
    """Verifica se o lance parece sacrificar material de propósito."""
    if board_before_move.gives_check(move):
        return False  # xeques são forçados demais pra parecer "brilhante"

    piece = board_before_move.piece_at(move.from_square)
    if piece is None:
        return False
    moved_value = PIECE_VALUES.get(piece.piece_type, 0)
    if moved_value < 3:
        return False

    captured_piece = board_before_move.piece_at(move.to_square)
    captured_value = PIECE_VALUES.get(captured_piece.piece_type, 0) if captured_piece else 0

    board_after = board_before_move.copy()
    board_after.push(move)
    opponent = board_after.turn  # de quem é a vez agora = o oponente de quem jogou
    attackers = board_after.attackers(opponent, move.to_square)
    if not attackers:
        return False

    min_attacker_value = min(
        PIECE_VALUES.get(board_after.piece_at(sq).piece_type, 0) for sq in attackers
    )
    net_loss = moved_value - captured_value

    if net_loss >= 2 and min_attacker_value <= moved_value:
        return True
    return False


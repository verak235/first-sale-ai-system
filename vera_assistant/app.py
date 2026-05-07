import os
import uuid

from dotenv import load_dotenv
from flask import Flask, Response, jsonify, render_template, request, stream_with_context

load_dotenv()

from agent.vera_agent import VeraAgent

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "dev-secret-change-in-production")

_agent = VeraAgent()


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/chat", methods=["POST"])
def chat():
    data = request.get_json(silent=True) or {}
    session_id = data.get("session_id") or str(uuid.uuid4())
    mode = data.get("mode", "chatbot")
    message = (data.get("message") or "").strip()
    content_type = data.get("content_type")

    if not message:
        return jsonify({"error": "No message provided"}), 400

    if mode not in ("content", "chatbot", "business"):
        return jsonify({"error": "Invalid mode"}), 400

    def generate():
        import json
        # Send session_id first so the client can store it
        yield f"data: {json.dumps({'type': 'session_id', 'session_id': session_id})}\n\n"
        yield from _agent.stream_response(session_id, mode, message, content_type)

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disable nginx buffering if behind a proxy
            "Connection": "keep-alive",
        },
    )


@app.route("/reset", methods=["POST"])
def reset():
    data = request.get_json(silent=True) or {}
    session_id = data.get("session_id")
    if session_id:
        _agent.reset(session_id)
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=True, host="0.0.0.0", port=port)

import json
import anthropic
from typing import Generator

from agent.prompts import MODE_PROMPTS

_MAX_HISTORY_TURNS = 20  # keep last 20 turns to bound context growth


class VeraAgent:
    def __init__(self):
        self.client = anthropic.Anthropic()
        self.model = "claude-opus-4-7"
        # sessions: { session_id: { "mode": str, "messages": list } }
        self._sessions: dict[str, dict] = {}

    # ------------------------------------------------------------------
    # Session helpers
    # ------------------------------------------------------------------

    def _get_session(self, session_id: str, mode: str) -> dict:
        """Return the session dict, creating or resetting it as needed."""
        session = self._sessions.get(session_id)
        if session is None:
            session = {"mode": mode, "messages": []}
            self._sessions[session_id] = session
        elif session["mode"] != mode:
            # Mode changed — start a fresh conversation
            session["mode"] = mode
            session["messages"] = []
        return session

    def reset(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)

    def _trim_history(self, messages: list) -> list:
        """Keep only the most recent turns so context stays manageable."""
        if len(messages) > _MAX_HISTORY_TURNS * 2:
            return messages[-(  _MAX_HISTORY_TURNS * 2):]
        return messages

    # ------------------------------------------------------------------
    # Streaming response
    # ------------------------------------------------------------------

    def stream_response(
        self,
        session_id: str,
        mode: str,
        user_message: str,
        content_type: str | None = None,
    ) -> Generator[str, None, None]:
        """
        Yield SSE-formatted strings.

        Event types emitted:
          {"type": "text",       "content": "<delta>"}
          {"type": "done"}
          {"type": "error",      "content": "<message>"}
        """
        session = self._get_session(session_id, mode)

        # Build user turn — prepend content type context when relevant
        full_message = user_message
        if content_type and mode == "content":
            content_labels = {
                "youtube-script": "YouTube Script",
                "instagram-caption": "Instagram Caption",
                "blog-post": "Blog Post",
                "email-newsletter": "Email Newsletter",
                "facebook-post": "Facebook Post",
                "pinterest-description": "Pinterest Description",
            }
            label = content_labels.get(content_type, content_type)
            full_message = f"[Content type: {label}]\n\n{user_message}"

        session["messages"].append({"role": "user", "content": full_message})
        session["messages"] = self._trim_history(session["messages"])

        system_prompt = MODE_PROMPTS.get(mode, MODE_PROMPTS["chatbot"])

        try:
            with self.client.messages.stream(
                model=self.model,
                max_tokens=4096,
                thinking={"type": "adaptive"},
                system=[
                    {
                        "type": "text",
                        "text": system_prompt,
                        # Cache the large, stable system prompt
                        "cache_control": {"type": "ephemeral"},
                    }
                ],
                messages=session["messages"],
            ) as stream:
                full_response = ""

                for event in stream:
                    if event.type == "content_block_delta":
                        if event.delta.type == "text_delta":
                            chunk = event.delta.text
                            full_response += chunk
                            yield _sse({"type": "text", "content": chunk})

                # Persist assistant response in history
                session["messages"].append(
                    {"role": "assistant", "content": full_response}
                )

                yield _sse({"type": "done"})

        except anthropic.APIStatusError as exc:
            yield _sse({"type": "error", "content": f"API error {exc.status_code}: {exc.message}"})
        except anthropic.APIConnectionError:
            yield _sse({"type": "error", "content": "Connection error. Please check your internet connection."})
        except anthropic.AuthenticationError:
            yield _sse({"type": "error", "content": "Invalid API key. Please check your ANTHROPIC_API_KEY."})


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"

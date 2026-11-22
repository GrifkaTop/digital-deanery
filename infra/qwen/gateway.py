import json
import subprocess
import sys
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def main():
    payload = sys.stdin.buffer.read(65537)
    if len(payload) > 65536:
        raise ValueError("Request too large")
    if sys.argv[1:] == ["warmup"]:
        request = urllib.request.Request(
            "http://127.0.0.1:11434/api/generate",
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect).open(
            request, timeout=50
        ) as response:
            body = response.read(65537)
            if response.status != 200 or len(body) > 65536 or json.loads(body).get("done") is not True:
                raise ValueError("Invalid Ollama response")
        return
    key = subprocess.check_output(
        ["sudo", "-n", "/usr/bin/cat", "/etc/tesla-model-gateway/api-key"], text=True
    ).strip()
    request = urllib.request.Request(
        "http://127.0.0.1:8081/v1/chat/completions",
        data=payload,
        headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"},
    )
    with urllib.request.build_opener(NoRedirect).open(request, timeout=11) as response:
        body = response.read(65537)
        if response.status != 200 or len(body) > 65536:
            raise ValueError("Invalid gateway response")
        sys.stdout.buffer.write(body)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        sys.exit(1)

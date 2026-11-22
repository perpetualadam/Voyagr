"""Authenticated Unix-socket readiness; no credentials or routes in output."""
import base64
import http.client
from pathlib import Path
import socket


class UnixConnection(http.client.HTTPConnection):
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect('/run/gh11/service.sock')


def main():
    secret = Path('/run/secrets/gh11-password').read_text().strip()
    token = base64.b64encode(('prototype:' + secret).encode()).decode()
    connection = UnixConnection('localhost', timeout=3)
    try:
        connection.request('GET', '/api/prototype/versions', headers={'Authorization': 'Basic ' + token})
        response = connection.getresponse()
        response.read(8192)
        if response.status != 200:
            raise SystemExit(1)
    finally:
        connection.close()


if __name__ == '__main__':
    main()

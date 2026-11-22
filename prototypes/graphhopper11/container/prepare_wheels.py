"""Download only hash-locked Linux/amd64 wheels; never disable TLS verification."""
from pathlib import Path
import subprocess
import sys


def main():
    root = Path(__file__).resolve().parent
    subprocess.run([sys.executable, '-m', 'pip', 'download', '--require-hashes',
                    '--only-binary=:all:', '--python-version', '311', '--implementation', 'cp',
                    '--abi', 'cp311', '--platform', 'manylinux_2_28_x86_64',
                    '--platform', 'manylinux2014_x86_64', '--dest', str(root/'wheels'),
                    '-r', str(root/'requirements.lock')], check=True)


if __name__ == '__main__':
    main()

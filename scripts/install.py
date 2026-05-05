#!/usr/bin/env python3
"""
cmtoken plugin installer/updater - Linux / macOS / Windows
One command for ALL platforms, for both new install and update:

  python3 -c "import urllib.request;exec(urllib.request.urlopen('http://159.75.246.86:19000/install').read())"
"""
import urllib.request
import tempfile
import subprocess
import sys
import os

SERVER = "http://159.75.246.86:19000"
TGZ = "cmtoken.tgz"
PLUGIN = "cmtoken"


def run(cmd, input_text=None):
    print(f"  > {' '.join(cmd)}")
    return subprocess.run(cmd, capture_output=True, text=True, input=input_text)


def main():
    print(f"📦 cmtoken plugin installer")
    print(f"   Platform: {sys.platform}")

    # Download latest
    url = f"{SERVER}/{TGZ}"
    tmpdir = tempfile.mkdtemp()
    tgz_path = os.path.join(tmpdir, TGZ)

    print(f"⬇  Downloading {url} ...")
    urllib.request.urlretrieve(url, tgz_path)
    size_kb = os.path.getsize(tgz_path) / 1024
    print(f"   Downloaded {size_kb:.0f} KB")

    # Remove old version (auto-confirm with "y")
    print(f"🔄 Removing old version if exists...")
    r = run(["openclaw", "plugins", "uninstall", PLUGIN], input_text="y\n")
    if r.returncode == 0 and "not found" not in (r.stdout + r.stderr).lower():
        print(f"   Old version removed")
    else:
        print(f"   Clean install (no previous version)")

    # Install new
    print(f"🔧 Installing {PLUGIN}...")
    r = run(["openclaw", "plugins", "install", tgz_path])
    if r.returncode != 0:
        print(f"❌ Install failed:")
        print(r.stderr or r.stdout)
        sys.exit(1)

    if r.stdout:
        for line in r.stdout.strip().split('\n'):
            print(f"   {line}")

    # Cleanup
    try:
        os.remove(tgz_path)
        os.rmdir(tmpdir)
    except OSError:
        pass

    print(f"✅ {PLUGIN} installed/updated successfully!")


if __name__ == "__main__":
    main()

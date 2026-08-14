import os
import pty
import signal
import sys


password = os.environ.pop("Q_NEXUS_INTERACTIVE_TEST_PASSWORD", None)
if not password or len(sys.argv) < 2:
    raise SystemExit("A test password and command are required.")

pid, descriptor = pty.fork()
if pid == 0:
    os.execvpe(sys.argv[1], sys.argv[1:], os.environ)


def terminate_child(_signal, _frame):
    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        pass


signal.signal(signal.SIGTERM, terminate_child)
output = b""
sent_password = False
sent_confirmation = False
while True:
    try:
        chunk = os.read(descriptor, 4096)
    except OSError:
        break
    if not chunk:
        break
    output += chunk
    os.write(sys.stdout.fileno(), chunk)
    if not sent_password and b"Password: " in output:
        sent_password = True
        os.write(descriptor, password.encode() + b"\r")
    if not sent_confirmation and b"Confirm password: " in output:
        sent_confirmation = True
        os.write(descriptor, password.encode() + b"\r")

_, status = os.waitpid(pid, 0)
raise SystemExit(os.waitstatus_to_exitcode(status))

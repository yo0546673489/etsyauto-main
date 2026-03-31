import paramiko
import sys

host = '185.241.4.225'
user = 'root'
password = 'aA@05466734890'

commands = [
    'cat /opt/profitly/.env | grep -i messages_api || echo "NOT SET"',
    'docker ps --format "table {{.Names}}\\t{{.Status}}"',
]

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

try:
    client.connect(host, username=user, password=password, timeout=15)
    print("SSH connected!")
    for cmd in commands:
        stdin, stdout, stderr = client.exec_command(cmd)
        out = stdout.read().decode()
        err = stderr.read().decode()
        print(f"\n$ {cmd}")
        if out: print(out)
        if err: print("STDERR:", err)
    client.close()
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)

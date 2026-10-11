import sys
import time
import serial

port = serial.Serial(port=None, baudrate=115200, timeout=0.25)
port.dtr = False
port.rts = False
port.port = sys.argv[1]
port.open()
print('Serial diagnostics open; waiting for ESP32 output.', flush=True)
until = time.monotonic() + 25
while time.monotonic() < until:
    line = port.readline().decode('utf-8', errors='replace').strip()
    if line and not any(secret in line.lower() for secret in ['bearer ', 'password', 'access_token']):
        print(line, flush=True)
port.close()

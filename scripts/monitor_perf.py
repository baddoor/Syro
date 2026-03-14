import psutil
import time
import csv
import os
import sys
import argparse
from datetime import datetime

try:
    import GPUtil
    HAS_GPU = True
except ImportError:
    HAS_GPU = False

def get_obsidian_processes():
    """获取所有 Obsidian 相关的进程"""
    obsidian_procs = []
    for proc in psutil.process_iter(['pid', 'name']):
        try:
            name = proc.info['name'].lower()
            if 'obsidian' in name:
                obsidian_procs.append(proc)
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            pass
    return obsidian_procs

def start_monitor(csv_filename="obsidian_hardware_perf.csv", interval=0.5, duration=0):
    print(f"开始监控 Obsidian 性能，每 {interval} 秒记录一次。")
    if duration > 0:
        print(f"监控将在 {duration} 秒后自动结束。")
    print(f"数据将保存至: {os.path.abspath(csv_filename)}")
    
    with open(csv_filename, mode='w', newline='', encoding='utf-8') as file:
        writer = csv.writer(file)
        # 写入表头
        headers = ["Timestamp", "Time(s)", "Total CPU(%)", "Total RAM(MB)", "Process Count"]
        if HAS_GPU:
            headers.extend(["GPU Load(%)", "GPU VRAM(MB)"])
        writer.writerow(headers)

        start_time = time.time()
        
        try:
            while True:
                current_time = time.time()
                elapsed = current_time - start_time
                
                if duration > 0 and elapsed >= duration:
                    break
                    
                timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
                
                total_cpu = 0.0
                total_ram = 0.0 # Bytes
                
                # 更新进程列表
                procs = get_obsidian_processes()
                
                for p in procs:
                    try:
                        cpu = p.cpu_percent(interval=None)
                        mem = p.memory_info().rss
                        total_cpu += cpu
                        total_ram += mem
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        continue
                
                total_ram_mb = total_ram / (1024 * 1024)
                row = [timestamp, f"{elapsed:.2f}", f"{total_cpu:.2f}", f"{total_ram_mb:.2f}", len(procs)]

                if HAS_GPU:
                    try:
                        gpus = GPUtil.getGPUs()
                        if gpus:
                            row.extend([f"{gpus[0].load * 100:.2f}", f"{gpus[0].memoryUsed:.2f}"])
                        else:
                            row.extend(["0", "0"])
                    except Exception:
                        row.extend(["0", "0"])

                writer.writerow(row)
                file.flush()
                
                if len(procs) > 0:
                    print(f"[{elapsed:.1f}s] CPU: {total_cpu:.1f}% | RAM: {total_ram_mb:.1f}MB | 进程数: {len(procs)}")
                else:
                    print(f"[{elapsed:.1f}s] 等待 Obsidian 启动...", end='\r')
                
                time.sleep(interval)
                
        except KeyboardInterrupt:
            print(f"\n监控被用户中止。")

    print(f"监控结束，数据已保存至 {csv_filename}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Monitor Obsidian Hardware Usage")
    parser.add_argument("--interval", type=float, default=0.5, help="Sampling interval in seconds")
    parser.add_argument("--duration", type=int, default=0, help="Monitoring duration in seconds (0 for infinite)")
    parser.add_argument("--output", type=str, default="obsidian_hardware_perf.csv", help="Output CSV filename")
    
    args = parser.parse_args()
    start_monitor(csv_filename=args.output, interval=args.interval, duration=args.duration)

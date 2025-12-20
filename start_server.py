import subprocess
import time
import os
import webbrowser

# --- CONFIGURATIE (AANGEPAST VOOR LOCATIE BINNEN STUDIO MAP) ---

# 1. KlavarStudio (We zitten nu IN deze map, dus puntje)
studio_folder = "." 
studio_port = 8000

# 2. Klavar Flow (We moeten één map omhoog en dan naar flow/dist)
# '../' betekent: ga de map uit, terug naar de hoofdmap
flow_folder = "../klavar_flow/dist"      
flow_port = 8001
# --------------------

def start_server(folder, port):
    """Start een http server voor een specifieke map"""
    print(f"🚀 Starten van {folder} op http://localhost:{port}")
    return subprocess.Popen(
        ["python3", "-m", "http.server", str(port), "--directory", folder],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )

if __name__ == "__main__":
    print("--- KlavarHub Local Server ---")
    
    # Check flow dist map (Studio map bestaat sowieso, want daar zijn we)
    if not os.path.exists(flow_folder):
        print(f"❌ FOUT: Ik kan de map '{flow_folder}' niet vinden.")
        print("Zit dit script wel in de map 'klavarstudio'?")
        exit()

    try:
        p1 = start_server(studio_folder, studio_port)
        p2 = start_server(flow_folder, flow_port)

        print("\n✅ Alles draait! Je apps openen nu in de browser...")
        print("Druk op Ctrl+C om te stoppen.\n")
        
        time.sleep(1.5)
        webbrowser.open(f"http://localhost:{studio_port}")
        webbrowser.open(f"http://localhost:{flow_port}")

        p1.wait()
        p2.wait()

    except KeyboardInterrupt:
        print("\n🛑 Stoppen van servers...")
        p1.terminate()
        p2.terminate()
        print("Tot ziens!")
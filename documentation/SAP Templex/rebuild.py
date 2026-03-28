#!/usr/bin/env python3
"""
SAP Templex — Script de reconstrucción
Uso: python3 rebuild.py [--output ./carpeta_destino]
Lee sap-templex-bundle.json y genera todos los archivos HTML en la carpeta destino.
"""

import json
import os
import argparse

def rebuild(bundle_path: str, output_dir: str):
    if not os.path.exists(bundle_path):
        print(f"ERROR: No se encuentra {bundle_path}")
        return

    with open(bundle_path, 'r', encoding='utf-8') as f:
        bundle = json.load(f)

    os.makedirs(output_dir, exist_ok=True)

    for filename, content in bundle.items():
        out_path = os.path.join(output_dir, filename)
        with open(out_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"✓  {filename}  ({len(content):,} chars)")

    print(f"\n{len(bundle)} archivos generados en: {os.path.abspath(output_dir)}")
    print("Abre index.html en tu navegador para empezar.")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Reconstruye los selectores SAP desde el bundle JSON.')
    parser.add_argument('--bundle', default='sap-templex-bundle.json', help='Ruta al archivo JSON')
    parser.add_argument('--output', default='./sap-templex', help='Carpeta de destino')
    args = parser.parse_args()
    rebuild(args.bundle, args.output)

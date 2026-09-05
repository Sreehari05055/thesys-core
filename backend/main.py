import argparse
from asgi import app

def main():
    parser = argparse.ArgumentParser(description="ChatPilot runner")
    parser.add_argument("--host", default="0.0.0.0", help="Host for the FastAPI server")
    parser.add_argument("--port", default=8000, type=int, help="Port for the FastAPI server")
    args = parser.parse_args()

    # Production runner
    import uvicorn
    print(f"Starting production server on {args.host}:{args.port} with 1 worker...")
    uvicorn.run(app, host=args.host, port=args.port, workers=1)


if __name__ == '__main__':
    main()


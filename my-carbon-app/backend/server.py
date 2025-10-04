from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # so React can talk to Flask

@app.route("/api/hello", methods=["GET"])
def hello():
    return jsonify({"message": "Hello from Flask backend!"})

@app.route("/api/calculate", methods=["POST"])
def calculate():
    data = request.json
    items = data.get("items", [])
    return jsonify({"received_items": items})

if __name__ == "__main__":
    app.run(port=5000, debug=True)
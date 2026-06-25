import Vapor

func routes(_ app: Application) throws {
    app.post("api", "chat") { req -> Response in
        let body = try req.content.decode([String: String].self)
        print("Chat request: \(body["message"] ?? "")")
        return Response(status: .ok)
    }

    app.delete("api", "admin", "users") { req -> Response in
        let body = try req.content.decode([String: String].self)
        print("Deleting user: \(body["userId"] ?? "")")
        return Response(status: .ok)
    }

    app.post("api", "stripe", "webhook") { req -> Response in
        let event = try req.content.decode([String: Any].self)
        print("Webhook event: \(event["type"] ?? "")")
        return Response(status: .ok)
    }
}

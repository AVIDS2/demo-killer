import 'package:shelf/shelf.dart';
import 'package:shelf/shelf_io.dart' as io;

Future<Response> chatHandler(Request request) async {
  var body = await request.readAsString();
  print('Chat request: $body');
  return Response.ok('{"text": "response"}');
}

Future<Response> deleteUserHandler(Request request) async {
  var body = await request.readAsString();
  print('Deleting user: $body');
  return Response.ok('{"ok": true}');
}

Future<Response> stripeWebhookHandler(Request request) async {
  var event = await request.readAsString();
  print('Webhook event: $event');
  return Response.ok('{"received": true}');
}

void main() async {
  var handler = Pipeline()
    .addHandler((req) async {
      if (req.url.toString() == '/api/chat' && req.method == 'POST') return chatHandler(req);
      if (req.url.toString() == '/api/admin/users' && req.method == 'DELETE') return deleteUserHandler(req);
      if (req.url.toString() == '/api/stripe/webhook' && req.method == 'POST') return stripeWebhookHandler(req);
      return Response.notFound('{}');
    });
  var server = await io.serve(handler, 'localhost', 8080);
}

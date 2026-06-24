<?php

use Illuminate\Http\Request;
use OpenAI\Laravel\Facades\OpenAI;

Route::post('/api/chat', function (Request $request) {
    $message = $request->input('message');
    $result = OpenAI::chat()->create([
        'model' => 'gpt-4o-mini',
        'messages' => [['role' => 'user', 'content' => $message]],
    ]);
    return response()->json(['text' => $result->choices[0]->message->content]);
});

Route::delete('/api/admin/users', function (Request $request) {
    $userId = $request->input('userId');
    DB::table('users')->where('id', $userId)->delete();
    return response()->json(['ok' => true]);
});

Route::post('/api/stripe/webhook', function (Request $request) {
    $event = $request->all();
    if ($event['type'] === 'checkout.session.completed') {
        var_dump('paid', $event['data']['object']['id']);
    }
    return response()->json(['received' => true]);
});

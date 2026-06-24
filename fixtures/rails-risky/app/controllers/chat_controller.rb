class ChatController < ApplicationController
  def create
    message = params[:message]
    client = OpenAI::Client.new
    result = client.chat(parameters: {
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: message }]
    })
    render json: { text: result.dig("choices", 0, "message", "content") }
  end
end

class Admin::UsersController < ApplicationController
  def destroy
    user_id = params[:userId]
    User.where(id: user_id).delete_all
    render json: { ok: true }
  end
end

class StripeWebhooksController < ApplicationController
  def create
    event = params.to_unsafe_h
    if event[:type] == "checkout.session.completed"
      puts "paid #{event[:data][:object][:id]}"
    end
    render json: { received: true }
  end
end

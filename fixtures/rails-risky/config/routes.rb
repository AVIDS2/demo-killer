Rails.application.routes.draw do
  post '/api/chat', to: 'chat#create'
  delete '/api/admin/users', to: 'admin/users#destroy'
  post '/api/stripe/webhook', to: 'stripe_webhooks#create'
end

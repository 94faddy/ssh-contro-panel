#!/bin/bash

APP_SSH_PANEL="SSH_PANEL"
APP_SSH_PANEL_WS="SSH_PANEL_WS"

echo "🛑 Stopping old PM2 processes if running..."
pm2 delete $APP_SSH_PANEL 2>/dev/null
pm2 delete $APP_SSH_PANEL_WS 2>/dev/null

echo "🚀 Starting SSH_PANEL..."
pm2 start npm --name "$APP_SSH_PANEL" -- run start:next
pm2 start npm --name "$APP_SSH_PANEL_WS" -- run start:ws


echo "💾 Saving PM2 process list..."
pm2 save

echo "✅ System started with PM2!"

echo -e "\n📜 Opening logs for $APP_SSH_PANEL and $APP_SSH_PANEL_WS...\n"
pm2 logs $APP_SSH_PANEL $APP_SSH_PANEL_WS 

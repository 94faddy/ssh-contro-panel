#!/bin/bash

APP_SSH_PANEL="SSH_PANEL"
APP_SSH_PANEL_WS="SSH_PANEL_WS"

echo "🛑 Stopping SSH_PANEL..."

pm2 delete $APP_SSH_PANEL 2>/dev/null
pm2 delete $APP_SSH_PANEL_WS 2>/dev/null

echo "✅ PM2 processes stopped."

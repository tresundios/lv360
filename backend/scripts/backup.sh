#!/bin/bash
# ============================================================
# PostgreSQL Auto Backup Script
# Chạy hàng ngày lúc 02:30 AM IST (UTC+5:30)
# Giữ lại backup 30 ngày gần nhất, tự động xoá backup cũ
# ============================================================

BACKUP_DIR="/backups"
DB_HOST="postgres"
DB_PORT="5432"
DB_NAME="${POSTGRES_DB:-lamviec360}"
DB_USER="${POSTGRES_USER:-admin}"
RETENTION_DAYS=30

# Tạo thư mục backup nếu chưa có
mkdir -p "$BACKUP_DIR"

echo "=========================================="
echo "[BACKUP] Backup service started"
echo "[BACKUP] Timezone: $(date +%Z) | Time: $(date)"
echo "[BACKUP] Schedule: Daily at 02:30 AM IST"
echo "[BACKUP] Retention: ${RETENTION_DAYS} days"
echo "=========================================="

while true; do
    # Tính thời gian đến 02:30 AM tiếp theo
    NOW=$(date +%s)
    TARGET=$(date -d "today 02:30" +%s 2>/dev/null || date -d "02:30" +%s)

    # Nếu 02:30 hôm nay đã qua, đặt target là 02:30 ngày mai
    if [ "$NOW" -ge "$TARGET" ]; then
        TARGET=$(( TARGET + 86400 ))
    fi

    WAIT_SECONDS=$(( TARGET - NOW ))
    NEXT_RUN=$(date -d "@$TARGET" "+%Y-%m-%d %H:%M:%S %Z")

    echo "[BACKUP] Next backup at: $NEXT_RUN (waiting ${WAIT_SECONDS}s)"
    sleep "$WAIT_SECONDS"

    # ── Thực hiện backup ──────────────────────────────────
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"

    echo "[BACKUP] Starting backup: $BACKUP_FILE"

    pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        --no-owner --no-privileges --format=plain \
        | gzip > "$BACKUP_FILE"

    if [ $? -eq 0 ]; then
        SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
        echo "[BACKUP] SUCCESS: $BACKUP_FILE ($SIZE)"
    else
        echo "[BACKUP] FAILED: Could not backup $DB_NAME"
        rm -f "$BACKUP_FILE"
    fi

    # ── Xoá backup cũ hơn RETENTION_DAYS ngày ────────────
    echo "[BACKUP] Cleaning backups older than ${RETENTION_DAYS} days..."
    DELETED=$(find "$BACKUP_DIR" -name "*.sql.gz" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
    echo "[BACKUP] Deleted $DELETED old backup(s)"

    # ── Liệt kê backup hiện có ───────────────────────────
    echo "[BACKUP] Current backups:"
    ls -lh "$BACKUP_DIR"/*.sql.gz 2>/dev/null || echo "  (none)"
    echo "=========================================="
done

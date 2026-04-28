#!/bin/bash
# VaultDo Secure Key Generator
# Generates secure random keys for production deployment

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${BLUE}==== $1 ====${NC}"
}

print_result() {
    echo -e "${GREEN}$1${NC}"
}

print_header "VaultDo Secure Key Generator"
echo ""

# Check for openssl
if ! command -v openssl &> /dev/null; then
    echo "ERROR: openssl is required but not installed."
    echo "Install with: apt-get install openssl (Linux) or brew install openssl (macOS)"
    exit 1
fi

# Generate keys
print_header "Generating Secure Keys"
echo ""

JWT_SECRET=$(openssl rand -base64 32)
AES_KEY=$(openssl rand -base64 32)

print_result "JWT_SECRET (for signing tokens):"
echo "$JWT_SECRET"
echo ""

print_result "AES_KEY_B64 (for encryption at rest):"
echo "$AES_KEY"
echo ""

# Export to .env format
print_header "Environment Variables"
echo ""
echo "Add these to your .env file:"
echo ""
echo "JWT_SECRET=$JWT_SECRET"
echo "AES_KEY_B64=$AES_KEY"
echo ""

# Option to save to file
read -p "Save to .env file? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    ENV_FILE=".env"
    
    # Check if .env exists
    if [ -f "$ENV_FILE" ]; then
        echo "Creating backup of existing $ENV_FILE"
        cp "$ENV_FILE" "$ENV_FILE.backup.$(date +%s)"
    fi
    
    # Update or create .env
    if grep -q "^JWT_SECRET=" "$ENV_FILE" 2>/dev/null; then
        # Update existing values
        sed -i.bak "s/^JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" "$ENV_FILE"
        sed -i.bak "s/^AES_KEY_B64=.*/AES_KEY_B64=$AES_KEY/" "$ENV_FILE"
        rm -f "$ENV_FILE.bak"
    else
        # Append to file
        echo "" >> "$ENV_FILE"
        echo "JWT_SECRET=$JWT_SECRET" >> "$ENV_FILE"
        echo "AES_KEY_B64=$AES_KEY" >> "$ENV_FILE"
    fi
    
    print_result "✓ Keys saved to $ENV_FILE"
    echo ""
fi

# Generate other useful keys
print_header "Additional Useful Commands"
echo ""
print_result "Generate MONGODB password:"
echo "  openssl rand -base64 32"
echo ""
print_result "Generate API key:"
echo "  openssl rand -hex 32"
echo ""
print_result "Generate session secret:"
echo "  openssl rand -base64 64"
echo ""

print_header "Security Reminder"
echo "⚠️  IMPORTANT:"
echo "  - Never commit .env files to version control"
echo "  - Keep these keys secure and unique per environment"
echo "  - Store in a secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.)"
echo "  - Rotate keys periodically"
echo ""

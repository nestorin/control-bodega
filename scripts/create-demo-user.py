#!/usr/bin/env python3
# Script para crear usuario demo en Firebase Auth
# Ejecutar desde la carpeta functions:
#   DEMO_USER_PASSWORD='...' python3 ../scripts/create-demo-user.py

import sys
import os
DEMO_USER_PASSWORD = os.environ.get('DEMO_USER_PASSWORD')
if not DEMO_USER_PASSWORD:
    print('❌ Missing DEMO_USER_PASSWORD. Provide it through the environment; it is never logged.', file=sys.stderr)
    sys.exit(2)

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'functions', 'venv', 'lib', 'python3.11', 'site-packages'))

import firebase_admin
from firebase_admin import auth, firestore, credentials

# Inicializar Firebase Admin con credenciales por defecto (usa GOOGLE_APPLICATION_CREDENTIALS)
try:
    # En entorno local, usa las credenciales por defecto
    firebase_admin.initialize_app(options={
        'projectId': 'exepa-almacen-safe'
    })
except ValueError:
    # Ya inicializado
    pass

def create_demo_user():
    email = 'exepabodega@gmail.com'
    password = DEMO_USER_PASSWORD
    display_name = 'Usuario Demo Bodega EXEPA'
    
    try:
        # Verificar si el usuario ya existe
        try:
            user_record = auth.get_user_by_email(email)
            print(f'✅ Usuario ya existe: {user_record.uid}')
        except auth.UserNotFoundError:
            # Crear nuevo usuario
            user_record = auth.create_user(
                email=email,
                password=password,
                display_name=display_name,
                email_verified=True
            )
            print(f'✅ Usuario creado: {user_record.uid}')
        
        # Establecer custom claims
        auth.set_custom_user_claims(user_record.uid, {
            'role': 'ADMIN',
            'organizationId': 'org_exepa_001',
            'warehouseId': 'wh_tehuacan_1'
        })
        print('✅ Custom claims establecidos (ADMIN)')
        
        # Crear documento de perfil en Firestore
        db = firestore.client()
        db.document(f'organizations/org_exepa_001/users/{user_record.uid}').set({
            'userId': user_record.uid,
            'organizationId': 'org_exepa_001',
            'email': email,
            'displayName': display_name,
            'photoURL': '',
            'role': 'ADMIN',
            'warehouseId': 'wh_tehuacan_1',
            'status': 'ACTIVE',
            'createdAt': firestore.SERVER_TIMESTAMP,
            'updatedAt': firestore.SERVER_TIMESTAMP
        })
        print('✅ Perfil creado en Firestore')
        
        print('\n🎉 Usuario demo listo:')
        print(f'   Email: {email}')
        print('   Password: provided from DEMO_USER_PASSWORD (not displayed)')
        print(f'   Role: ADMIN')
        
    except Exception as e:
        print(f'❌ Error: {e}')
        return 1
    
    return 0

if __name__ == '__main__':
    sys.exit(create_demo_user())

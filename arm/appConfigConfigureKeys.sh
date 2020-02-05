#!/bin/bash

################
# This script is used to aid in creating the app config and configuring the various keys. 
#
# Ref:
#   https://docs.microsoft.com/en-us/cli/azure/ext/appconfig/appconfig/kv?view=azure-cli-latest#ext-appconfig-az-appconfig-kv-import
#   https://github.com/MicrosoftDocs/azure-docs/blob/master/articles/azure-app-configuration/scripts/cli-work-with-keys.md
#
# Pre-requisite :
#   - azure command client (az cli - https://docs.microsoft.com/en-us/cli/azure/?view=azure-cli-latest) installed
#   - az login (https://docs.microsoft.com/en-us/cli/azure/reference-index?view=azure-cli-latest#az-login) executed
################

PARAM_RG=<<fil in resource group name>>
PARAM_APPCONFIG_NAME=<<fill in with the azure app configuration name>>
PARAM_LOCATION=<<update the location>>
PARAM_KV_URL=<<fill in with kv url ex:https://kvXYS.vault.azure.net/secrets >>
PARAM_ROLE=<<fill in ROLE>>
PARAM_WAREHOUSE=<<fill in with snowflake virtual warehouse>>
PARAM_SNOWFLAKE_ACCOUNT=<<snowflake account >>

#Add the appconfig extension to the az cli commands
az extension add -n appconfig

#echo "Creating app config ${PARAM_APPCONFIG_NAME} ..."
#az appconfig create -g $PARAM_RG -n $PARAM_APPCONFIG_NAME -l $PARAM_LOCATION

echo "Creating key ..."
az appconfig kv set -n $PARAM_APPCONFIG_NAME --key 'SNOWSQL-ACCOUNT' --value "${PARAM_SNOWFLAKE_ACCOUNT}" --yes
az appconfig kv set -n $PARAM_APPCONFIG_NAME --key 'azfn:fnQuery:snowsql_qry_role' --value "${PARAM_ROLE}" --label 'dev' --yes
az appconfig kv set -n $PARAM_APPCONFIG_NAME --key 'azfn:fnQuery:snowsql_qry_wh' --value "${PARAM_WAREHOUSE}" --label 'dev' --yes

az appconfig kv set -n $PARAM_APPCONFIG_NAME --key 'azfn:fnQuery:snowsql_qry_usr' --value "${PARAM_KV_URL}/SNOWSQL-USER" --label 'dev' --content-type 'application/vnd.microsoft.appconfig.keyvaultref+json;charset=utf-8' --yes
az appconfig kv set -n $PARAM_APPCONFIG_NAME --key 'azfn:fnQuery:snowsql_qry_pwd' --value "${PARAM_KV_URL}/SNOWSQL-PASSWORD" --label 'dev' --content-type 'application/vnd.microsoft.appconfig.keyvaultref+json;charset=utf-8' --yes

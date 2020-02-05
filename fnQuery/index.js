/**
 * Entry point for query service api end point.
 */
const { DefaultAzureCredential  }= require("@azure/identity"); //https://www.npmjs.com/package/@azure/identity
const appConfig = require("@azure/app-configuration"); //https://www.npmjs.com/package/@azure/app-configuration
const { SecretClient } = require("@azure/keyvault-secrets"); //https://www.npmjs.com/package/@azure/keyvault-secrets
const Snowflake = require('snowflake-sdk');

const azCredential = new DefaultAzureCredential();

/**
 * Holds the connection and caches it. Subsequent call can use reuse the 
 * connection to speed up the process.
 */
let snowflakeConn = null;  //cache the connection 
let appConfigInfo = null; //Caches the configuration

/**
 * Issues a query against Snowflake
 * @param {*} context 
 * @param {*} p_snowflakeConn : snowflake connection 
 * @param {*} sqlStatement : The sql statement to be executed. 
 * 
 * The result is wrapped inside a JSON object ,ex :
 *  { "RESULT": [
        {
            "COL_NAME": 1
        }
        ]
    }
 */
function issueQuery(context, p_sqlStatement) {
    context.log(`Issuing query ${p_sqlStatement} ...`);
    var dbResponse = {};
    dbResponse['RESULT'] = [];

    var statement = snowflakeConn.execute({
        sqlText: p_sqlStatement
      });
      
    var stream = statement.streamRows();
    stream.on('error', function(err) {
        console.error('ERROR' + err);
        context.res = {
            status: 500,
            body: JSON.stringify(err),
            headers: { 'Content-Type': 'application/json' }
        };
        context.done();
    });
    
    stream.on('data', function(row) {
        dbResponse['RESULT'].push(row);
    });
    
    stream.on('end', function() {
        context.res = {
            status: 200,
            body: dbResponse,
            headers: { 'Content-Type': 'application/json' }
        };
        context.done();
    });
}

/**
 * Retreives the application configuration from Azure config
 */
function getApplicationConfigurationForSnowflake(context) {
    const appConfigURI = process.env["APP_CONFIG_URI"];
    const appConfigClient = new appConfig.AppConfigurationClient(appConfigURI);

    if(appConfigInfo != null) {
        return new Promise(function(resolve, reject) {
            resolve(appConfigInfo);
        });
    } 

    context.log('Getting application context ...');
    return Promise.all([
        appConfigClient.getConfigurationSetting( {key : 'SNOWSQL-ACCOUNT'})
        , appConfigClient.getConfigurationSetting({key : 'azfn:fnQuery:snowsql_qry_role' ,label: 'dev'})
        , appConfigClient.getConfigurationSetting({key : 'azfn:fnQuery:snowsql_qry_wh' ,label: 'dev'})
        , appConfigClient.getConfigurationSetting({key : 'azfn:fnQuery:snowsql_qry_usr' ,label: 'dev'})
        , appConfigClient.getConfigurationSetting({key : 'azfn:fnQuery:snowsql_qry_pwd' ,label: 'dev'})
    
    ]).then( (appConfigSettings) => {
        appConfigInfo = {};

        //console.log(settings);
        appConfigSettings.forEach(e => {
            //console.log(` Setting ${e.key} ... `);
            appConfigInfo[e.key] = e.value;
        })
        
        return appConfigInfo;
    }).catch((error) => {
        context.log(` Error while retreiving application config : ${error} `);
    });

}

/**
 * Retreives the secrets from Key vault for the following app configs
 *  - azfn:fnQuery:snowsql_qry_usr
 *  - azfn:fnQuery:snowsql_qry_pwd
 * @param {*} context
 * @param {*} kvAppConfigKey : azfn:fnQuery:snowsql_qry_usr or azfn:fnQuery:snowsql_qry_pwd
 * @param {*} configKey : the key under which the value will be stored once retrieved.
 */
function RetreiveKeyVaultSecrets(context) {

    function getKVSecrets(context ,kvAppConfigKey ,configKey) {

        if(appConfigInfo.hasOwnProperty(configKey)) {
            return new Promise(function(resolve, reject) {
                resolve(appConfigInfo);
            });
        } 

        const kvurl_with_secret = JSON.parse(appConfigInfo[kvAppConfigKey])['uri']; 
        kvurl = kvurl_with_secret.substring(0 ,kvurl_with_secret.indexOf("/secrets"));
        kvsecret_name = kvurl_with_secret.substring(kvurl_with_secret.lastIndexOf("/")+1);
        
        const client = new SecretClient(kvurl, azCredential);

        return Promise.all([
            client.getSecret(kvsecret_name)
        ]).then( (x) => {
            //context.log(x);
            appConfigInfo[configKey] = x[0].value;
        });
    }

    context.log('Getting key vault secrets ...');
    return Promise.all([
        getKVSecrets(context ,'azfn:fnQuery:snowsql_qry_usr' ,'SNOWSQL-USER')
       ,getKVSecrets(context ,'azfn:fnQuery:snowsql_qry_pwd' ,'SNOWSQL-PWD')
    ]); 
}

/**
 * Connects to snowflake.
 * 
 * @param {*} context 
 */
function connectToSnowflake(context) {

    if(typeof snowflakeConn !== 'undefined'  && snowflakeConn != null) {
        return new Promise(function(resolve, reject) {
            resolve(snowflakeConn);
        });
    } 
    
    context.log.info(`Connecting to snowflake @[${appConfigInfo["SNOWSQL-ACCOUNT"]}] ...`);
    snowflakeConnObj = Snowflake.createConnection( {
                account: appConfigInfo["SNOWSQL-ACCOUNT"], 
                username: appConfigInfo["SNOWSQL-USER"], 
                password: appConfigInfo["SNOWSQL-PWD"], 
                warehouse: appConfigInfo["azfn:fnQuery:snowsql_qry_wh"], 
                role: appConfigInfo["azfn:fnQuery:snowsql_qry_role"]  
            });

    return Promise.resolve(snowflakeConnObj.connect());
}

function extractSqlStatmentFromRequestObject(context, req) {
    
    var sqlStmt = null;
    //retreive the passed in query
    //context.log(JSON.stringify(context.req.body));
    if (req.query.sqlStatement || (req.body && req.body.sqlStatement)) {
        context.log('Fetching sql statement from query ...');  
        sqlStmt = (req.query.sqlStatement || req.body.sqlStatement);
    }

    return sqlStmt;
}

//------- Module exports --------------

module.exports = function (context, req) {
    
    const sqlStmt = extractSqlStatmentFromRequestObject(context, req);
    if(sqlStmt == null) {
        context.res = {
            status: 400,
            body: "Please pass a name on the query string or in the request body"
        };
        context.done();
        return {};
    }
    
    const applicationConfigPromise = getApplicationConfigurationForSnowflake(context);
    const kvDataRetrievedConfigPromise = applicationConfigPromise.then( () => RetreiveKeyVaultSecrets(context));
    const snowflakeConnPromise = kvDataRetrievedConfigPromise.then( () => connectToSnowflake(context));
    
    snowflakeConnPromise.then( (conn) => {
            snowflakeConn = conn;
            context.log('snowflake conn '  + (snowflakeConn != null));
            issueQuery(context ,sqlStmt );
    }).catch((error) => {
        context.log.error('ERROR',error);
    });
};

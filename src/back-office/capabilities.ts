/** Mounted capabilities, distinct from retained role-policy permissions. */
export function backOfficeFeatures(agentsEnabled:boolean){
 return {agentsEnabled,userProvisioningEnabled:false,staffProvisioningEnabled:false,policyEditingEnabled:false} as const;
}

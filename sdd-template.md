**Software Design Document (SDD)**

**\<Feature name\>**

AID\<XX\>/BUG\<YY\>  
**version**: \<\>

**date**: \<\>  
**author**: \<\>

**reviewers**: \<\>  
**status**:  in progress \<in progress/complete/obsolete\>

**Table of Contents**


## Introduction

* Provide links to PRD/SRS/other SDD etc.  
* Describe the feature at a high level here. Even if it is mentioned in another document, it is better to put a brief recap.  
* Put details of the use cases, and customer names if known.

## High Level Design

* Block diagram for the feature, which should show the various components of the feature and their interaction.  
* If this feature builds on an existing feature, try to indicate the new changes on top of the original design.  
* Use a table to list various scenarios and the expected behavior of the system.  
* Mention if some interface or interaction has changed with other components of the system.

## Detailed Design

* Elaborate the design using flow charts and/or state transition diagrams.  
* Mention the configuration workflow via the UI / CLI / other interfaces (e.g. openconfig).  
* Mention the implementation level details for the feature. Some examples are:  
  * Addition of new threads or processes  
  * Handling new attributes in configuration files  
  * Changes or additions in interfaces, data exchanged with other processes  
  * Addition of new structs, enums, and important variables and functions.  
  * etc.  
* Mention important files/directories in the repo where changes would take place, including DB.  
* Add code snippets/function names/module names for better clarity.  
* Mention if we are going to break any backward compatibility, or any changes required to maintain it e.g. new WM server, old AP combination.

## Debugging Support

* Mention the logs, events or CLI commands that would be added to help in debugging any issues.

## Test Plan

* Please follow template  
* Add the auto/unit/integration test plan doc link here.  
* 

## Feature Toggle

* Add details of the feature toggle flag. The following options can be considered for toggling the feature:  
  * Runtime toggle  
  * Compile/build time toggle

## Points To Note

* Add the list here for any known issues, limitations, restrictions etc.

## Security Considerations

* Any security vulnerabilities to be mentioned here.

## Scalability Considerations

* Impact on RF roaming within multiple APs  
* Impact on cloud with multiple records/data  
* Impact on third party server with the data we share

## Patent Considerations

* Mention which section can be applied for patent

## Open Items

* Any items under discussion to be mentioned here.

## Review Meeting MoM

* Add any important points/questions discussed in design review meetings, and any action items for the same.
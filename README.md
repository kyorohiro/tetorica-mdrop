# Tetorica mdrop

# Memo

```
% dns-sd -B _http._tcp
Browsing for _http._tcp
DATE: ---Sun 26 Apr 2026---
 0:45:51.409  ...STARTING...
Timestamp     A/R    Flags  if Domain               Service Type         Instance Name
 0:45:51.410  Add        3   1 local.               _http._tcp.          Tetorica Home Server
 0:45:51.410  Add        2  11 local.               _http._tcp.          Tetorica Home Server

% dns-sd -L "Tetorica Home Server" _http._tcp local
Lookup Tetorica Home Server._http._tcp.local
DATE: ---Sun 26 Apr 2026---
 0:46:21.697  ...STARTING...
 0:46:22.128  Tetorica\032Home\032Server._http._tcp.local. can be reached at tetorica-home.local.:7878 (interface 11)
 path=/
 ```


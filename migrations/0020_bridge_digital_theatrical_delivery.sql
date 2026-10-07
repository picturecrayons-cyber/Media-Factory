insert into public.bridge_service_catalog (code,category,name,description,classification,pricing_method,unit_label)
values ('DIGITAL_THEATRICAL_DELIVERY','DELIVER','Digital / Theatrical Package Delivery','Destination-specific digital or theatrical delivery service','BILLABLE','PER_DESTINATION','destination')
on conflict (code) do nothing;

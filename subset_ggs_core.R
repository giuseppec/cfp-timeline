core_file <- "core.csv"
ggs_file  <- "ggs.csv"

core <- read.csv2(core_file, stringsAsFactors = FALSE)
ggs <- read.csv2(ggs_file, stringsAsFactors = FALSE) 

field = c("Machine learning", "Artificial intelligence", "Data management and data science", "Computer vision and multimedia computation")
rank = c("A++", "A*", "A+", "A", "A-", "B", "B-")

core = core[core$rank %in% rank & core$field %in% field, ]
ggs = ggs[ggs$acronym %in% core$acronym, ]

write.csv2(core, core_file, row.names = FALSE)
write.csv2(ggs, ggs_file, row.names = FALSE)

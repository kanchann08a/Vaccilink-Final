window.VacciLinkSchedule = {
    generate: function(childDOB) {
        const dobStr = childDOB || "";
        const dobParts = dobStr.split("-");
        let dob = new Date();
        if (dobParts.length === 3) {
            dob = new Date(parseInt(dobParts[0]), parseInt(dobParts[1]) - 1, parseInt(dobParts[2]));
        }
        dob.setHours(0, 0, 0, 0);

        function addDays(d, days) {
            const result = new Date(d);
            result.setDate(result.getDate() + days);
            return result;
        }

        const batches = [
            {
                age: "At Birth",
                days: 0,
                vaccines: [
                    { name: "BCG", purpose: "Tuberculosis (TB)", description: "Protects infants from severe forms of tuberculosis.", sideEffects: "Small red sore at injection site.", doseSite: "Left upper arm" },
                    { name: "OPV-0", purpose: "Poliovirus", description: "Oral polio vaccine given at birth.", sideEffects: "None usually.", doseSite: "Oral drops" },
                    { name: "Hepatitis-B", purpose: "Hepatitis B", description: "Prevents Hepatitis B infection.", sideEffects: "Mild fever, soreness.", doseSite: "Thigh (intramuscular)" },
                    { name: "Vitamin K", purpose: "Vitamin K Deficiency Bleeding", description: "Prevents severe bleeding in newborns.", sideEffects: "Pain at injection site.", doseSite: "Thigh (intramuscular)" }
                ]
            },
            {
                age: "6 Weeks",
                days: 42,
                vaccines: [
                    { name: "Pentavalent-1", purpose: "Diphtheria, Pertussis, Tetanus, Hep B, Hib", description: "5-in-1 vaccine.", sideEffects: "Fever, crying.", doseSite: "Thigh" },
                    { name: "OPV-1", purpose: "Poliovirus", description: "Oral polio vaccine.", sideEffects: "None.", doseSite: "Oral drops" },
                    { name: "Rotavirus-1", purpose: "Rotavirus", description: "Protects against severe diarrhea.", sideEffects: "Mild diarrhea/vomiting.", doseSite: "Oral drops" },
                    { name: "IPV-1", purpose: "Poliovirus", description: "Inactivated polio vaccine.", sideEffects: "Soreness.", doseSite: "Thigh" },
                    { name: "PCV-1", purpose: "Pneumococcal disease", description: "Protects against pneumonia and meningitis.", sideEffects: "Fever, soreness.", doseSite: "Thigh" }
                ]
            },
            {
                age: "10 Weeks",
                days: 70,
                vaccines: [
                    { name: "Pentavalent-2", purpose: "Diphtheria, Pertussis, Tetanus, Hep B, Hib", description: "Second dose of 5-in-1.", sideEffects: "Fever.", doseSite: "Thigh" },
                    { name: "OPV-2", purpose: "Poliovirus", description: "Oral polio vaccine.", sideEffects: "None.", doseSite: "Oral drops" },
                    { name: "Rotavirus-2", purpose: "Rotavirus", description: "Protects against severe diarrhea.", sideEffects: "Mild diarrhea.", doseSite: "Oral drops" },
                    { name: "PCV-2", purpose: "Pneumococcal disease", description: "Second dose of PCV.", sideEffects: "Fever.", doseSite: "Thigh" }
                ]
            },
            {
                age: "14 Weeks",
                days: 98,
                vaccines: [
                    { name: "Pentavalent-3", purpose: "Diphtheria, Pertussis, Tetanus, Hep B, Hib", description: "Third dose of 5-in-1.", sideEffects: "Fever.", doseSite: "Thigh" },
                    { name: "OPV-3", purpose: "Poliovirus", description: "Oral polio vaccine.", sideEffects: "None.", doseSite: "Oral drops" },
                    { name: "Rotavirus-3", purpose: "Rotavirus", description: "Protects against severe diarrhea.", sideEffects: "None.", doseSite: "Oral drops" },
                    { name: "IPV-2", purpose: "Poliovirus", description: "Inactivated polio vaccine.", sideEffects: "Soreness.", doseSite: "Thigh" },
                    { name: "PCV-3", purpose: "Pneumococcal disease", description: "Third dose of PCV.", sideEffects: "Fever.", doseSite: "Thigh" }
                ]
            },
            {
                age: "9 Months",
                days: 270,
                vaccines: [
                    { name: "MR-1", purpose: "Measles and Rubella", description: "Protects against Measles and Rubella.", sideEffects: "Fever, mild rash.", doseSite: "Right upper arm" },
                    { name: "Vitamin A", purpose: "Vitamin A deficiency", description: "Prevents night blindness.", sideEffects: "None.", doseSite: "Oral" }
                ]
            },
            {
                age: "16 Months",
                days: 480,
                vaccines: [
                    { name: "MR-2", purpose: "Measles and Rubella", description: "Second dose of MR.", sideEffects: "Fever.", doseSite: "Right upper arm" },
                    { name: "DPT Booster", purpose: "Diphtheria, Pertussis, Tetanus", description: "Booster dose for DPT.", sideEffects: "Fever, swelling.", doseSite: "Thigh" },
                    { name: "OPV Booster", purpose: "Poliovirus", description: "Booster oral polio vaccine.", sideEffects: "None.", doseSite: "Oral drops" }
                ]
            }
        ];

        let fullSchedule = [];
        batches.forEach(batch => {
            batch.vaccines.forEach(v => {
                fullSchedule.push({
                    batchAge: batch.age,
                    days: batch.days,
                    vaccineName: v.name,
                    scheduledDate: addDays(dob, batch.days),
                    purpose: v.purpose,
                    description: v.description,
                    sideEffects: v.sideEffects,
                    doseSite: v.doseSite
                });
            });
        });

        return fullSchedule;
    },

    mergeWithHistory: function(schedule, historyFromDB) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        return schedule.map(sch => {
            // Find in history
            let dbRecord = historyFromDB.find(h => h.vaccineName === sch.vaccineName);
            
            let status = "upcoming";
            let dateTaken = null;
            let hospital = "";
            let scheduledDate = sch.scheduledDate;

            if (dbRecord) {
                if (dbRecord.dateTaken) {
                    status = "completed";
                    dateTaken = new Date(dbRecord.dateTaken);
                } else if (dbRecord.status === "scheduled") {
                    status = "scheduled";
                    if(dbRecord.scheduledDate) scheduledDate = new Date(dbRecord.scheduledDate);
                } else {
                    if (today > sch.scheduledDate) {
                        status = "overdue";
                    }
                }
                hospital = dbRecord.hospital || "";
            } else {
                if (today > sch.scheduledDate) {
                    status = "overdue";
                }
            }

            return {
                ...sch,
                scheduledDate: scheduledDate,
                dueDate: sch.scheduledDate,
                status: status,
                dateTaken: dateTaken,
                hospital: hospital
            };
        });
    }
};

using Microsoft.EntityFrameworkCore;
using PhishGuard.Data.Models;

namespace PhishGuard.Data;

public class PhishGuardDbContext : DbContext
{
    public PhishGuardDbContext(DbContextOptions<PhishGuardDbContext> options)
        : base(options)
    {
    }

    public DbSet<Incident> Incidents { get; set; }
    public DbSet<PaymentCheck> PaymentChecks { get; set; }
    public DbSet<InvoiceCheck> InvoiceChecks { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Incident>(entity =>
        {
            entity.HasIndex(e => e.Url);
            entity.HasIndex(e => e.Timestamp);
        });

        modelBuilder.Entity<PaymentCheck>(entity =>
        {
            entity.HasIndex(e => e.RequestId);
            entity.HasIndex(e => e.Url);
            entity.HasIndex(e => e.Domain);
        });

        modelBuilder.Entity<InvoiceCheck>(entity =>
        {
            entity.HasIndex(e => e.AnalysisId).IsUnique();
            entity.HasIndex(e => e.DocHash);
            entity.HasIndex(e => e.Status);
            entity.HasIndex(e => e.Timestamp);
        });
        
        // Ensure unique index on AnalysisId
        modelBuilder.Entity<InvoiceCheck>()
            .HasIndex(i => i.AnalysisId)
            .IsUnique();
    }
}

